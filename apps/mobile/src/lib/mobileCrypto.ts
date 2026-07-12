/** VaultChat mobile crypto — libsignal msrcrypto (AES-CBC, HMAC, AES-GCM). */

const CRYPTO_CHECK = "vaultchat-mobile-crypto-v2";

let verified = false;

export function ensureMobileCrypto(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ensureWebCryptoPolyfill } = require("../../webcrypto-polyfill");
  ensureWebCryptoPolyfill();
}

export async function verifyMobileCrypto(): Promise<void> {
  ensureMobileCrypto();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { crypto: signalCrypto } = require("@privacyresearch/libsignal-protocol-typescript/lib/internal/crypto.js");

  const key = new Uint8Array(32);
  globalThis.crypto.getRandomValues(key);
  const iv = new Uint8Array(16);
  globalThis.crypto.getRandomValues(iv);
  const plain = new TextEncoder().encode(CRYPTO_CHECK);

  const encrypted = await signalCrypto.encrypt(key, plain, iv);
  const decrypted = await signalCrypto.decrypt(key, encrypted, iv);
  const text = new TextDecoder().decode(new Uint8Array(decrypted));

  if (text !== CRYPTO_CHECK) {
    throw new Error("Mobile Signal crypto self-test failed");
  }

  verified = true;
}

export function isMobileCryptoVerified(): boolean {
  return verified;
}
