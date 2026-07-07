import { VaultDevice, type VaultDeviceState } from "@vaultchat/crypto";
import type { CountryCode } from "libphonenumber-js";
import { isValidPhoneNumber } from "libphonenumber-js";
import { getCountryDialCode } from "./countries.js";
import { saveLoginHint } from "./login-hints.js";
import { DEVICE_KEY, deviceStorageKey, STORAGE_KEY, type StorageAdapter } from "./storage.js";

async function migrateLegacyDeviceKey(storage: StorageAdapter, userId: string): Promise<void> {
  const legacy = await storage.getItem(DEVICE_KEY);
  const key = deviceStorageKey(userId);
  const existing = await storage.getItem(key);
  if (legacy && !existing) {
    await storage.setItem(key, legacy);
  }
  if (legacy) await storage.removeItem(DEVICE_KEY);
}

export async function persistDevice(
  storage: StorageAdapter,
  device: VaultDevice,
  userId: string
): Promise<void> {
  await migrateLegacyDeviceKey(storage, userId);
  await storage.setItem(deviceStorageKey(userId), JSON.stringify(device.exportState()));
}

export async function clearSession(storage: StorageAdapter): Promise<void> {
  // Sign out only — keep per-user E2EE keys and decrypted message cache for re-login.
  await storage.removeItem(STORAGE_KEY);
}

export async function loadDevice(
  storage: StorageAdapter,
  session: StoredSession
): Promise<VaultDevice> {
  await migrateLegacyDeviceKey(storage, session.userId);
  const raw = await storage.getItem(deviceStorageKey(session.userId));
  if (raw) {
    try {
      const state = JSON.parse(raw) as VaultDeviceState;
      return VaultDevice.restore(session.userId, session.deviceId, state);
    } catch {
      await storage.removeItem(deviceStorageKey(session.userId));
      throw new Error("Device keys corrupted. Please log out and register again.");
    }
  }
  throw new Error("Device keys missing. Please log out and register again.");
}

export interface StoredSession {
  username: string;
  userId: string;
  token: string;
  deviceId: number;
  emailVerified?: boolean;
}

export async function loadSession(storage: StorageAdapter): Promise<StoredSession | null> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    await clearSession(storage);
    return null;
  }
}

export async function saveSession(storage: StorageAdapter, session: StoredSession, email?: string): Promise<void> {
  await storage.setItem(STORAGE_KEY, JSON.stringify(session));
  const hint = { userId: session.userId, deviceId: session.deviceId };
  await saveLoginHint(storage, session.username, hint);
  if (email) {
    await saveLoginHint(storage, email.trim().toLowerCase(), hint);
  }
}

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

export interface RegistrationFields {
  username: string;
  email: string;
  password: string;
  phoneCountry: string;
  phoneNumber: string;
}

export type RegistrationFieldErrors = {
  username?: string;
  email?: string;
  password?: string;
  phoneCountry?: string;
  phoneNumber?: string;
  form?: string;
};

export type LoginFieldErrors = {
  identifier?: string;
  password?: string;
  form?: string;
};

export function hasFieldErrors(errors: RegistrationFieldErrors | LoginFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function validateUsername(username: string): string | null {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return "Username is required.";
  if (!USERNAME_RE.test(normalized)) {
    return "3–32 characters: letters, numbers, underscore only.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return "Email is required.";
  if (!EMAIL_RE.test(normalized)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < MIN_PASSWORD_LEN) return "Password must be at least 8 characters.";
  return null;
}

export function validatePhone(countryIso: string, phoneNumber: string): string | null {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!digits) return "Phone number is required.";
  if (!countryIso) return "Select a country.";

  try {
    if (!isValidPhoneNumber(digits, countryIso as CountryCode)) {
      return "Enter a valid phone number for the selected country.";
    }
  } catch {
    return "Enter a valid phone number for the selected country.";
  }
  return null;
}

export function validateRegistrationFields(fields: RegistrationFields): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {};
  const usernameErr = validateUsername(fields.username);
  if (usernameErr) errors.username = usernameErr;
  const emailErr = validateEmail(fields.email);
  if (emailErr) errors.email = emailErr;
  const passwordErr = validatePassword(fields.password);
  if (passwordErr) errors.password = passwordErr;
  const phoneErr = validatePhone(fields.phoneCountry, fields.phoneNumber);
  if (phoneErr) errors.phoneNumber = phoneErr;
  return errors;
}

export interface NormalizedRegistrationFields {
  username: string;
  email: string;
  password: string;
  phoneCountry: string;
  phoneCountryCode: string;
  phoneNumber: string;
}

export function normalizeRegistrationFields(fields: RegistrationFields): NormalizedRegistrationFields {
  return {
    username: fields.username.trim().toLowerCase(),
    email: fields.email.trim().toLowerCase(),
    password: fields.password,
    phoneCountry: fields.phoneCountry,
    phoneCountryCode: getCountryDialCode(fields.phoneCountry),
    phoneNumber: fields.phoneNumber.replace(/\D/g, ""),
  };
}
