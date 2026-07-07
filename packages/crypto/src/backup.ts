import type { VaultDeviceState } from "./device.js";
import { arrayBufferToBase64, base64ToArrayBuffer, utf8ToArrayBuffer } from "./buffers.js";

export interface AccountKeyBackupPayload {
  version: 1;
  /** deviceId string → Signal store state for that device */
  devices: Record<string, VaultDeviceState>;
}

interface EncryptedBackupBlob {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
}

const PBKDF2_ITERATIONS = 310_000;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    utf8ToArrayBuffer(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptAccountBackup(
  password: string,
  payload: AccountKeyBackupPayload
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = utf8ToArrayBuffer(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const blob: EncryptedBackupBlob = {
    v: 1,
    salt: arrayBufferToBase64(salt.buffer),
    iv: arrayBufferToBase64(iv.buffer),
    ct: arrayBufferToBase64(cipher),
  };
  return JSON.stringify(blob);
}

export async function decryptAccountBackup(
  password: string,
  blob: string
): Promise<AccountKeyBackupPayload | null> {
  try {
    const parsed = JSON.parse(blob) as EncryptedBackupBlob;
    if (parsed.v !== 1 || !parsed.salt || !parsed.iv || !parsed.ct) return null;

    const salt = new Uint8Array(base64ToArrayBuffer(parsed.salt));
    const iv = new Uint8Array(base64ToArrayBuffer(parsed.iv));
    const key = await deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      base64ToArrayBuffer(parsed.ct)
    );
    const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(plain))) as AccountKeyBackupPayload;
    if (payload.version !== 1 || typeof payload.devices !== "object") return null;
    return payload;
  } catch {
    return null;
  }
}
