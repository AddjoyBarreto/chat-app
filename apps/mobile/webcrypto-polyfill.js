/**
 * Web Crypto for React Native via libsignal msrcrypto (AES-CBC, HMAC, AES-GCM, PBKDF2).
 * Must run AFTER Expo.fx — Expo can replace globals on startup.
 */
const msrcrypto = require("@privacyresearch/libsignal-protocol-typescript/lib/msrcrypto.js");

function wireLibsignalCrypto(impl) {
  try {
    const { setWebCrypto } = require("@privacyresearch/libsignal-protocol-typescript/lib/internal/crypto.js");
    setWebCrypto(impl);
  } catch {
    // libsignal not loaded yet.
  }
}

function ensureWebCryptoPolyfill() {
  require("react-native-get-random-values");

  const getRandomValues =
    global.crypto?.getRandomValues?.bind(global.crypto) ??
    ((arr) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    });

  const impl = {
    getRandomValues,
    subtle: msrcrypto.subtle,
  };

  global.crypto = impl;
  wireLibsignalCrypto(impl);
}

module.exports = { ensureWebCryptoPolyfill, wireLibsignalCrypto };
