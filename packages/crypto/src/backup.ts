import type { VaultDeviceState } from "./device.js";
import { arrayBufferToBase64, base64ToArrayBuffer, utf8ToArrayBuffer } from "./buffers.js";

/** Cached DM / timeline entry stored inside the password backup (v2+). */
export interface BackupCachedMessage {
  id: string;
  from: "me" | "them";
  content: unknown;
  time: string;
  date: string;
  status: string;
}

export interface BackupConversationTimeline {
  peerId: string;
  messages: BackupCachedMessage[];
  newestAt?: string;
  updatedAt: string;
}

/**
 * Password-encrypted account backup.
 * v1: Signal device stores only.
 * v2: also includes message history + community keys so reinstall can show past chats.
 */
export interface AccountKeyBackupPayload {
  version: 1 | 2;
  /** deviceId string → Signal store state for that device */
  devices: Record<string, VaultDeviceState>;
  /** Successful decrypts only — required to re-show history after wipe (Signal is one-shot). */
  messageCache?: Record<string, BackupCachedMessage>;
  /** Per-peer conversation timelines */
  timelines?: Record<string, BackupConversationTimeline>;
  /** Community/group AES keys (base64) */
  groupKeys?: Record<string, string>;
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
    const payload = JSON.parse(
      new TextDecoder().decode(new Uint8Array(plain))
    ) as AccountKeyBackupPayload;
    if (
      (payload.version !== 1 && payload.version !== 2) ||
      typeof payload.devices !== "object" ||
      !payload.devices
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
