import { deviceMaterialMatchesServer, VaultDevice } from "@vaultchat/crypto";
import type { LoginUserResponse, MessageEnvelope } from "@vaultchat/protocol";
import { fetchInbox, fetchOwnDeviceKeys, loginOnServer, uploadPreKeys } from "./api.js";
import {
  mergeAndUploadAccountBackup,
  bindBackupSession,
  tryRestoreDeviceFromBackup,
  restoreHistoryFromBackupOnly,
  hydrateBackupSession,
  getSessionBackupPassword,
  type RestoreHistoryResult,
} from "./key-backup.js";
import { decryptEnvelope, type DisplayMessage } from "./messages.js";
import { loadDevice, persistDevice, type StoredSession } from "./session.js";
import { deviceStorageKey, type StorageAdapter } from "./storage.js";

export class DeviceIdentityMismatchError extends Error {
  constructor() {
    super("DEVICE_IDENTITY_MISMATCH");
    this.name = "DeviceIdentityMismatchError";
  }
}

/** Local Signal identity must match the device slot on the server (linked-device model). */
export async function assertDeviceMatchesServer(
  token: string,
  device: VaultDevice
): Promise<void> {
  const material = await device.exportKeyMaterial();
  const server = await fetchOwnDeviceKeys(token);
  if (server.identityKey !== material.identityKeyPublic) {
    throw new DeviceIdentityMismatchError();
  }
}

export interface IdentitySyncResult {
  login: LoginUserResponse;
  device: VaultDevice;
  /** True when this install registered as a brand-new linked device (no matching backup slot). */
  isNewLinkedDevice: boolean;
  /** History restored from password backup (message cache / timelines / group keys). */
  restoredHistory?: RestoreHistoryResult;
}

/** Replenish one-time prekeys on server when running low locally. */
export async function replenishPreKeysIfNeeded(
  storage: StorageAdapter,
  device: VaultDevice,
  token: string,
  userId: string
): Promise<boolean> {
  const remaining = await device.countAvailablePreKeys();
  if (remaining >= 5) return false;

  const material = await device.exportKeyMaterial();
  const newKeys = await device.replenishPreKeys(10);
  await uploadPreKeys(token, {
    oneTimePreKeys: newKeys.length > 0 ? newKeys : material.oneTimePreKeys.slice(0, 1),
  });
  await persistDevice(storage, device, userId);
  return true;
}

/** Upload fresh prekeys when server-published keys diverge from local material. */
export async function repairServerPreKeysIfNeeded(
  storage: StorageAdapter,
  device: VaultDevice,
  token: string,
  userId: string
): Promise<boolean> {
  const material = await device.exportKeyMaterial();

  let server;
  try {
    server = await fetchOwnDeviceKeys(token);
  } catch {
    return false;
  }

  if (server.identityKey !== material.identityKeyPublic) {
    throw new DeviceIdentityMismatchError();
  }

  if (deviceMaterialMatchesServer(material, server)) return false;

  await uploadPreKeys(token, {
    signedPreKey: material.signedPreKey,
    oneTimePreKeys: material.oneTimePreKeys,
  });
  await persistDevice(storage, device, userId);
  return true;
}

/**
 * Align server device identity/prekeys with local keys.
 * Call after password login and whenever local device material may have changed.
 */
export async function syncIdentityWithServer(
  storage: StorageAdapter,
  device: VaultDevice,
  options: {
    identifier: string;
    password: string;
    deviceId: number;
    userId: string;
    deviceName?: string;
    isNewLinkedDevice?: boolean;
    restoredHistory?: RestoreHistoryResult;
  }
): Promise<IdentitySyncResult> {
  const requestedDeviceId = device.deviceId;
  let material = await device.exportKeyMaterial();
  const login = await loginOnServer({
    identifier: options.identifier,
    password: options.password,
    deviceId: options.deviceId,
    identityKeyPublic: material.identityKeyPublic,
    registrationId: material.registrationId,
    deviceName: options.deviceName,
  });

  const isNewLinkedDevice =
    options.isNewLinkedDevice === true || login.deviceId !== requestedDeviceId;

  let updatedDevice = device;
  if (login.deviceId !== device.deviceId) {
    updatedDevice = await VaultDevice.restore(
      options.userId,
      login.deviceId,
      device.exportState()
    );
  }

  if (login.preKeysRequired) {
    material = await updatedDevice.exportKeyMaterial();
    await uploadPreKeys(login.token, {
      signedPreKey: material.signedPreKey,
      oneTimePreKeys: material.oneTimePreKeys,
    });
    // Only wipe ratchets for a brand-new device slot. Re-uploading prekeys for
    // an existing identity must keep recovered sessions intact.
    if (isNewLinkedDevice) {
      updatedDevice.clearSessions();
    }
  } else {
    await repairServerPreKeysIfNeeded(storage, updatedDevice, login.token, login.userId);
  }

  await persistDevice(storage, updatedDevice, login.userId);
  await bindBackupSession(storage, login.userId, options.password);
  try {
    await mergeAndUploadAccountBackup(
      login.token,
      options.password,
      updatedDevice,
      storage,
      login.userId
    );
  } catch {
    // non-fatal — local keys still work; do not fail login if backup upload fails
  }
  return {
    login,
    device: updatedDevice,
    isNewLinkedDevice,
    restoredHistory: options.restoredHistory,
  };
}

/** Load local device or fail — never silently rotate keys without identity sync. */
export async function loadLocalDevice(
  storage: StorageAdapter,
  session: StoredSession
): Promise<VaultDevice> {
  return loadDevice(storage, session);
}

/** Bootstrap device after session is available (page reload, post-verify). */
export async function bootstrapDevice(
  storage: StorageAdapter,
  session: StoredSession
): Promise<VaultDevice> {
  const device = await loadDevice(storage, session);
  await assertDeviceMatchesServer(session.token, device);
  await repairServerPreKeysIfNeeded(storage, device, session.token, session.userId);
  await replenishPreKeysIfNeeded(storage, device, session.token, session.userId);
  const hasBackupPassword = await hydrateBackupSession(storage, session.userId);
  // Rebuild / storage wipe often leaves Signal keys but drops the sealed plaintext
  // cache. Pull history from the password backup whenever we can (Signal ciphertext
  // cannot be decrypted twice).
  if (hasBackupPassword) {
    try {
      const password = getSessionBackupPassword();
      if (password) {
        await restoreHistoryFromBackupOnly(
          storage,
          session.token,
          password,
          session.userId
        );
      }
    } catch {
      // non-fatal — chats still work for new messages
    }
  }
  return device;
}

/**
 * Load, restore from backup, or create keys — then link with the server.
 * WhatsApp/Signal model: each app install is a linked device with its own keys.
 * Password backup also restores prior message plaintext so history survives reinstall.
 */
export async function provisionDeviceForLogin(
  storage: StorageAdapter,
  options: {
    identifier: string;
    password: string;
    userId: string;
    deviceIdHint?: number;
    token: string;
    deviceName?: string;
  }
): Promise<IdentitySyncResult> {
  const { VaultDevice: VaultDeviceClass } = await import("@vaultchat/crypto");
  const preferDeviceId = options.deviceIdHint ?? 1;

  let device: VaultDevice;
  let isNewLinkedDevice = false;
  let restoredHistory: RestoreHistoryResult | undefined;

  const restoreOrCreate = async (): Promise<void> => {
    const restored = await tryRestoreDeviceFromBackup(
      storage,
      options.password,
      options.userId,
      preferDeviceId,
      options.token
    );
    if (restored) {
      device = restored.device;
      restoredHistory = restored.history;
      isNewLinkedDevice = false;
      return;
    }
    device = await VaultDeviceClass.create(options.userId, preferDeviceId);
    isNewLinkedDevice = true;
  };

  try {
    device = await loadDevice(storage, {
      username: options.identifier,
      userId: options.userId,
      token: options.token,
      deviceId: preferDeviceId,
    });
    await assertDeviceMatchesServer(options.token, device);
    // Local keys already work — still pull plaintext history from backup every login.
    try {
      restoredHistory = await restoreHistoryFromBackupOnly(
        storage,
        options.token,
        options.password,
        options.userId
      );
    } catch {
      restoredHistory = undefined;
    }
  } catch (err) {
    if (err instanceof DeviceIdentityMismatchError) {
      // Stale local keys — prefer password backup over silently minting a new identity.
      await storage.removeItem(deviceStorageKey(options.userId));
      await restoreOrCreate();
    } else {
      await restoreOrCreate();
    }
  }

  return syncIdentityWithServer(storage, device!, {
    identifier: options.identifier,
    password: options.password,
    deviceId: device!.deviceId,
    userId: options.userId,
    deviceName: options.deviceName,
    isNewLinkedDevice,
    restoredHistory,
  });
}

export interface InboxSyncOptions {
  token: string;
  device: VaultDevice;
  userId: string;
  storage: StorageAdapter;
  /** Skip envelopes already handled (e.g. via WebSocket). */
  isProcessed: (messageId: string) => boolean;
  markProcessed: (messageId: string) => void;
  onMessage: (display: DisplayMessage, envelope: MessageEnvelope) => void | Promise<void>;
}

/**
 * Fetch inbox messages missed while offline / disconnected.
 * Walks pagination until exhausted (capped) so catch-up is not limited to one page.
 * Dedupes by message id and relies on decrypt cache for history safety.
 */
export async function syncMissedInbox(options: InboxSyncOptions): Promise<number> {
  const maxPages = 20;
  let cursor: string | undefined;
  let synced = 0;
  let pages = 0;

  do {
    const page = await fetchInbox(options.token, { cursor, limit: 50 });
    for (const envelope of page.messages) {
      if (options.isProcessed(envelope.id)) continue;
      options.markProcessed(envelope.id);

      const display = await decryptEnvelope(options.device, envelope, options.userId, {
        storage: options.storage,
        userId: options.userId,
        myDeviceId: options.device.deviceId,
        tryDecrypt: true,
      });

      if (display.status !== "decrypt_failed") {
        await persistDevice(options.storage, options.device, options.userId);
      }

      await options.onMessage(display, envelope);
      synced++;
    }

    cursor = page.hasMore ? page.cursor : undefined;
    pages++;
  } while (cursor && pages < maxPages);

  return synced;
}
