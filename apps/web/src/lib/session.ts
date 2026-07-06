import { VaultDevice, type VaultDeviceState } from "@vaultchat/crypto";
import {
  deviceStorageKey,
  LOGIN_HINTS_KEY,
  STORAGE_KEY,
  type LoginHint,
} from "@vaultchat/client";

/** @deprecated Legacy single-device key */
const LEGACY_DEVICE_KEY = "vaultchat_device";

function migrateLegacyDeviceKey(userId: string): void {
  const legacy = localStorage.getItem(LEGACY_DEVICE_KEY);
  const key = deviceStorageKey(userId);
  if (legacy && !localStorage.getItem(key)) {
    localStorage.setItem(key, legacy);
  }
  if (legacy) localStorage.removeItem(LEGACY_DEVICE_KEY);
}

type HintMap = Record<string, LoginHint>;

function loadLoginHints(): HintMap {
  try {
    const raw = localStorage.getItem(LOGIN_HINTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as HintMap;
  } catch {
    return {};
  }
}

export function getLoginHint(identifier: string): LoginHint | null {
  return loadLoginHints()[identifier.trim().toLowerCase()] ?? null;
}

export function saveLoginHint(identifier: string, hint: LoginHint): void {
  const hints = loadLoginHints();
  hints[identifier.trim().toLowerCase()] = hint;
  localStorage.setItem(LOGIN_HINTS_KEY, JSON.stringify(hints));
}

export interface StoredSession {
  username: string;
  userId: string;
  token: string;
  deviceId: number;
  emailVerified?: boolean;
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: StoredSession, email?: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  saveLoginHint(session.username, { userId: session.userId, deviceId: session.deviceId });
  if (email) {
    saveLoginHint(email.trim().toLowerCase(), { userId: session.userId, deviceId: session.deviceId });
  }
}

export function persistDevice(device: VaultDevice, userId: string): void {
  migrateLegacyDeviceKey(userId);
  localStorage.setItem(deviceStorageKey(userId), JSON.stringify(device.exportState()));
}

export function clearSession(): void {
  // Sign out only — keep per-user E2EE keys and decrypted message cache for re-login.
  localStorage.removeItem(STORAGE_KEY);
}

export async function loadOrCreateDevice(session: StoredSession): Promise<VaultDevice> {
  migrateLegacyDeviceKey(session.userId);
  const raw = localStorage.getItem(deviceStorageKey(session.userId));
  if (raw) {
    try {
      const state = JSON.parse(raw) as VaultDeviceState;
      return VaultDevice.restore(session.username, session.deviceId, state);
    } catch {
      localStorage.removeItem(deviceStorageKey(session.userId));
      throw new Error("Device keys corrupted. Please log out and register again.");
    }
  }
  throw new Error("Device keys missing. Please log out and register again.");
}

export * from "./countries";
export * from "./registration";
