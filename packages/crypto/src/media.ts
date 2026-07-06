import { arrayBufferToBase64, base64ToArrayBuffer } from "./buffers.js";

export interface EncryptedAttachment {
  ciphertext: string; // base64
  nonce: string; // base64 — 12-byte GCM nonce
  key: string; // base64 — AES-256 key (embed inside Signal message envelope)
}

/**
 * Encrypt a file client-side before upload to object storage.
 * The returned `key` must be sent inside the Signal-encrypted message, not to the server alone.
 */
export async function encryptAttachment(data: ArrayBuffer): Promise<EncryptedAttachment> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, data);
  const rawKey = await crypto.subtle.exportKey("raw", key);

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    nonce: arrayBufferToBase64(nonce.buffer),
    key: arrayBufferToBase64(rawKey),
  };
}

export async function decryptAttachment(
  encrypted: EncryptedAttachment
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToArrayBuffer(encrypted.key),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const nonce = base64ToArrayBuffer(encrypted.nonce);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(nonce) }, key, base64ToArrayBuffer(encrypted.ciphertext));
}
