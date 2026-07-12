import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  utf8ToArrayBuffer,
  arrayBufferToUtf8,
} from "@vaultchat/crypto";
import type { StorageAdapter } from "./storage.js";

const VAULT_KEY_PREFIX = "vaultchat_vault_key_";

/** On-disk sealed blob: AES-256-GCM ciphertext (never plaintext JSON). */
export interface SealedBlob {
  v: 1;
  n: string;
  c: string;
}

export function vaultKeyStorageKey(userId: string): string {
  return `${VAULT_KEY_PREFIX}${userId}`;
}

export function isSealedBlob(value: unknown): value is SealedBlob {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.v === 1 && typeof obj.n === "string" && typeof obj.c === "string";
}

async function importAesKey(rawBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ToArrayBuffer(rawBase64),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Per-user AES key that never leaves the device storage adapter. */
export async function getOrCreateVaultKey(
  storage: StorageAdapter,
  userId: string
): Promise<CryptoKey> {
  const keyName = vaultKeyStorageKey(userId);
  const existing = await storage.getItem(keyName);
  if (existing) return importAesKey(existing);

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const raw = await crypto.subtle.exportKey("raw", key);
  await storage.setItem(keyName, arrayBufferToBase64(raw));
  return key;
}

export async function clearVaultKey(storage: StorageAdapter, userId: string): Promise<void> {
  await storage.removeItem(vaultKeyStorageKey(userId));
}

export async function sealJson(
  storage: StorageAdapter,
  userId: string,
  value: unknown
): Promise<string> {
  const key = await getOrCreateVaultKey(storage, userId);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = utf8ToArrayBuffer(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext);
  const sealed: SealedBlob = {
    v: 1,
    n: arrayBufferToBase64(nonce.buffer),
    c: arrayBufferToBase64(ciphertext),
  };
  return JSON.stringify(sealed);
}

export async function openSealedJson<T>(
  storage: StorageAdapter,
  userId: string,
  raw: string
): Promise<T | null> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSealedBlob(parsed)) {
      // Legacy plaintext — migrate by returning as-is; caller should re-seal on write.
      return parsed as T;
    }

    const key = await getOrCreateVaultKey(storage, userId);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(parsed.n)) },
      key,
      base64ToArrayBuffer(parsed.c)
    );
    return JSON.parse(arrayBufferToUtf8(plain)) as T;
  } catch {
    // Wrong key, corrupt blob, or vault key wiped — treat as empty.
    return null;
  }
}

export async function readSealedItem<T>(
  storage: StorageAdapter,
  userId: string,
  key: string
): Promise<T | null> {
  const raw = await storage.getItem(key);
  if (!raw) return null;
  return openSealedJson<T>(storage, userId, raw);
}

export async function writeSealedItem(
  storage: StorageAdapter,
  userId: string,
  key: string,
  value: unknown
): Promise<void> {
  await storage.setItem(key, await sealJson(storage, userId, value));
}
