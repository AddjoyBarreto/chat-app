/**
 * Minimal Web Crypto polyfill for React Native (AES-GCM + PBKDF2).
 * Covers @vaultchat/crypto group, media, and account backup flows.
 */
const { gcm } = require("@noble/ciphers/aes.js");
const { pbkdf2 } = require("@noble/hashes/pbkdf2.js");
const { sha256 } = require("@noble/hashes/sha2.js");

class CryptoKey {
  constructor(type, algorithm, extractable, usages, keyMaterial) {
    this.type = type;
    this.algorithm = algorithm;
    this.extractable = extractable;
    this.usages = usages;
    this._keyMaterial = keyMaterial;
  }
}

function toUint8(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new TypeError("Expected ArrayBuffer or ArrayBufferView");
}

function toArrayBuffer(view) {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

function assertAesGcm(algorithm) {
  if (algorithm?.name !== "AES-GCM") {
    throw new Error(`Unsupported algorithm: ${algorithm?.name ?? "unknown"}`);
  }
}

const subtle = {
  async generateKey(algorithm, extractable, keyUsages) {
    assertAesGcm(algorithm);
    const length = algorithm.length ?? 256;
    const raw = global.crypto.getRandomValues(new Uint8Array(length / 8));
    return new CryptoKey(
      "secret",
      { name: "AES-GCM", length },
      extractable,
      keyUsages,
      raw
    );
  },

  async importKey(format, keyData, algorithm, extractable, keyUsages) {
    if (format === "raw" && algorithm?.name === "AES-GCM") {
      return new CryptoKey(
        "secret",
        { name: "AES-GCM", length: algorithm.length ?? 256 },
        extractable,
        keyUsages,
        toUint8(keyData)
      );
    }
    if (format === "raw" && algorithm?.name === "PBKDF2") {
      return new CryptoKey("secret", { name: "PBKDF2" }, extractable, keyUsages, toUint8(keyData));
    }
    throw new Error(`Unsupported importKey: ${format} / ${algorithm?.name}`);
  },

  async exportKey(format, key) {
    if (format !== "raw") throw new Error(`Unsupported exportKey format: ${format}`);
    if (!key.extractable) throw new DOMException("key is not extractable", "InvalidAccessError");
    return toArrayBuffer(key._keyMaterial);
  },

  async encrypt(algorithm, key, data) {
    assertAesGcm(algorithm);
    const iv = toUint8(algorithm.iv);
    const plain = toUint8(data);
    const cipher = gcm(key._keyMaterial, iv);
    return toArrayBuffer(cipher.encrypt(plain));
  },

  async decrypt(algorithm, key, data) {
    assertAesGcm(algorithm);
    const iv = toUint8(algorithm.iv);
    const encrypted = toUint8(data);
    const cipher = gcm(key._keyMaterial, iv);
    return toArrayBuffer(cipher.decrypt(encrypted));
  },

  async deriveKey(algorithm, baseKey, derivedAlgorithm, extractable, keyUsages) {
    if (algorithm?.name !== "PBKDF2" || derivedAlgorithm?.name !== "AES-GCM") {
      throw new Error("Unsupported deriveKey algorithm");
    }
    const derived = pbkdf2(sha256, baseKey._keyMaterial, toUint8(algorithm.salt), {
      c: algorithm.iterations,
      dkLen: (derivedAlgorithm.length ?? 256) / 8,
    });
    return new CryptoKey(
      "secret",
      { name: "AES-GCM", length: derivedAlgorithm.length ?? 256 },
      extractable,
      keyUsages,
      derived
    );
  },
};

function installWebCryptoPolyfill() {
  if (global.crypto?.subtle) return;

  require("react-native-get-random-values");
  const getRandomValues = global.crypto.getRandomValues.bind(global.crypto);

  global.crypto = {
    getRandomValues,
    subtle,
  };
}

module.exports = { installWebCryptoPolyfill };
