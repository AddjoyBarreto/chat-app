import { deviceMaterialMatchesServer, VaultDevice } from "@vaultchat/crypto";
import type { LoginUserResponse, MessageEnvelope } from "@vaultchat/protocol";
import { fetchInbox, fetchOwnDeviceKeys, loginOnServer, uploadPreKeys } from "./api.js";
import { mergeAndUploadAccountBackup } from "./key-backup.js";
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
  }
): Promise<IdentitySyncResult> {
  let material = await device.exportKeyMaterial();
  const login = await loginOnServer({
    identifier: options.identifier,
    password: options.password,
    deviceId: options.deviceId,
    identityKeyPublic: material.identityKeyPublic,
    registrationId: material.registrationId,
    deviceName: options.deviceName,
  });

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
    updatedDevice.clearSessions();
  } else {
    await repairServerPreKeysIfNeeded(storage, updatedDevice, login.token, login.userId);
  }

  await persistDevice(storage, updatedDevice, login.userId);
  try {
    await mergeAndUploadAccountBackup(login.token, options.password, updatedDevice);
  } catch {
    // non-fatal — local keys still work
  }
  return { login, device: updatedDevice };
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
  return device;
}

/**
 * Load, restore from backup, or create keys — then link with the server.
 * WhatsApp/Signal model: each app install is a linked device with its own keys.
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
  const { tryRestoreDeviceFromBackup } = await import("./key-backup.js");
  const { VaultDevice: VaultDeviceClass } = await import("@vaultchat/crypto");

  let device: VaultDevice;
  try {
    device = await loadDevice(storage, {
      username: options.identifier,
      userId: options.userId,
      token: options.token,
      deviceId: options.deviceIdHint ?? 1,
    });
    await assertDeviceMatchesServer(options.token, device);
  } catch (err) {
    if (err instanceof DeviceIdentityMismatchError) {
      // Stale keys from another install — wipe and register as a new linked device.
      await storage.removeItem(deviceStorageKey(options.userId));
      device = await VaultDeviceClass.create(options.userId);
    } else {
      const preferDeviceId = options.deviceIdHint ?? 1;
      const restored = await tryRestoreDeviceFromBackup(
        storage,
        options.password,
        options.userId,
        preferDeviceId,
        options.token
      );
      device =
        restored ??
        (await VaultDeviceClass.create(options.userId, preferDeviceId));
    }
  }

  return syncIdentityWithServer(storage, device, {
    identifier: options.identifier,
    password: options.password,
    deviceId: device.deviceId,
    userId: options.userId,
    deviceName: options.deviceName,
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
 * Fetch recent inbox messages missed while offline / disconnected.
 * Dedupes by message id and relies on decrypt cache for history safety.
 */
export async function syncMissedInbox(options: InboxSyncOptions): Promise<number> {
  const { messages } = await fetchInbox(options.token);
  let synced = 0;

  for (const envelope of messages) {
    if (options.isProcessed(envelope.id)) continue;
    options.markProcessed(envelope.id);

    const display = await decryptEnvelope(
      options.device,
      envelope,
      options.userId,
      {
        storage: options.storage,
        userId: options.userId,
        myDeviceId: options.device.deviceId,
        tryDecrypt: true,
      }
    );

    if (display.status !== "decrypt_failed") {
      await persistDevice(options.storage, options.device, options.userId);
    }

    await options.onMessage(display, envelope);
    synced++;
  }

  return synced;
}
