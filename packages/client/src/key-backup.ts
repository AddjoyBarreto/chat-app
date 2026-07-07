import {
  decryptAccountBackup,
  encryptAccountBackup,
  VaultDevice,
  type AccountKeyBackupPayload,
} from "@vaultchat/crypto";
import { fetchAccountBackup, uploadAccountBackup } from "./api.js";
import { persistDevice } from "./session.js";
import type { StorageAdapter } from "./storage.js";

/** Merge current device into password-encrypted server backup (E2EE key sync). */
export async function mergeAndUploadAccountBackup(
  token: string,
  password: string,
  device: VaultDevice
): Promise<void> {
  let payload: AccountKeyBackupPayload = { version: 1, devices: {} };

  try {
    const { backup } = await fetchAccountBackup(token);
    if (backup) {
      const existing = await decryptAccountBackup(password, backup);
      if (existing) payload = existing;
    }
  } catch {
    // start fresh if fetch/decrypt fails
  }

  payload.devices[String(device.deviceId)] = device.exportState();
  const encrypted = await encryptAccountBackup(password, payload);
  await uploadAccountBackup(token, encrypted);
}

/** Restore local keys from server backup after reinstall / new client. */
export async function tryRestoreDeviceFromBackup(
  storage: StorageAdapter,
  password: string,
  userId: string,
  preferDeviceId: number,
  token: string
): Promise<VaultDevice | null> {
  const { backup } = await fetchAccountBackup(token);
  if (!backup) return null;

  const payload = await decryptAccountBackup(password, backup);
  if (!payload) return null;

  const state = payload.devices[String(preferDeviceId)];
  if (!state) return null;

  const device = await VaultDevice.restore(userId, preferDeviceId, state);
  await persistDevice(storage, device, userId);
  return device;
}
