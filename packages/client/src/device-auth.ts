import { deviceMaterialMatchesServer, VaultDevice } from "@vaultchat/crypto";
import type { LoginUserResponse, MessageEnvelope } from "@vaultchat/protocol";
import { fetchInbox, fetchOwnDeviceKeys, loginOnServer, uploadPreKeys } from "./api.js";
import { clearMessageCache } from "./message-cache.js";
import { decryptEnvelope, type DisplayMessage } from "./messages.js";
import { loadDevice, persistDevice, type StoredSession } from "./session.js";
import type { StorageAdapter } from "./storage.js";

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

  try {
    const server = await fetchOwnDeviceKeys(token);
    if (deviceMaterialMatchesServer(material, server)) return false;
  } catch {
    // Missing or invalid server keys — re-upload from local device.
  }

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
      options.identifier,
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
    await clearMessageCache(storage, login.userId);
  } else {
    await repairServerPreKeysIfNeeded(storage, updatedDevice, login.token, login.userId);
  }

  await persistDevice(storage, updatedDevice, login.userId);
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
  await repairServerPreKeysIfNeeded(storage, device, session.token, session.userId);
  await replenishPreKeysIfNeeded(storage, device, session.token, session.userId);
  return device;
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
      { storage: options.storage, userId: options.userId, tryDecrypt: true }
    );

    if (display.status !== "decrypt_failed") {
      await persistDevice(options.storage, options.device, options.userId);
    }

    await options.onMessage(display, envelope);
    synced++;
  }

  return synced;
}
