import { arrayBufferToBase64, base64ToArrayBuffer, utf8ToArrayBuffer, arrayBufferToUtf8 } from "./buffers.js";

/**
 * Group E2EE using a shared AES-256-GCM key.
 * Key is distributed to members via pairwise Signal messages (type: group_key).
 */
export class GroupCipher {
  private constructor(private readonly rawKey: ArrayBuffer) {}

  static async generate(): Promise<{ cipher: GroupCipher; keyBase64: string }> {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const raw = await crypto.subtle.exportKey("raw", key);
    return {
      cipher: new GroupCipher(raw),
      keyBase64: arrayBufferToBase64(raw),
    };
  }

  static fromKeyBase64(keyBase64: string): GroupCipher {
    return new GroupCipher(base64ToArrayBuffer(keyBase64));
  }

  async encrypt(plaintext: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      this.rawKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      utf8ToArrayBuffer(plaintext)
    );
    return JSON.stringify({
      n: arrayBufferToBase64(nonce.buffer),
      c: arrayBufferToBase64(ciphertext),
    });
  }

  async decrypt(payload: string): Promise<string> {
    const { n, c } = JSON.parse(payload) as { n: string; c: string };
    const key = await crypto.subtle.importKey(
      "raw",
      this.rawKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(n)) },
      key,
      base64ToArrayBuffer(c)
    );
    return arrayBufferToUtf8(plaintext);
  }
}
