const { Buffer } = require("buffer");

global.Buffer = Buffer;

const { installWebCryptoPolyfill } = require("./webcrypto-polyfill");
installWebCryptoPolyfill();

/** Expo's TextDecoder reports utf-16le but throws on decode — must test decode. */
function nativeTextDecoderSupportsUtf16Le() {
  if (typeof global.TextDecoder !== "function") return false;
  try {
    const decoder = new global.TextDecoder("utf-16le");
    return decoder.decode(new Uint8Array([0x61, 0x00])) === "a";
  } catch {
    return false;
  }
}

function installTextEncodingPolyfill() {
  try {
    delete global.TextDecoder;
  } catch (_) {}
  try {
    delete global.TextEncoder;
  } catch (_) {}

  const {
    TextDecoder: FullTextDecoder,
    TextEncoder: FullTextEncoder,
  } = require("text-encoding/lib/encoding.js");

  if (!FullTextDecoder || !FullTextEncoder) {
    throw new Error("text-encoding failed to provide TextDecoder/TextEncoder");
  }

  function CompatTextDecoder(label, options) {
    const normalized = String(label ?? "utf-8")
      .toLowerCase()
      .replace(/[-_]/g, "");
    if (normalized === "utf16le" || normalized === "ucs2") {
      return new FullTextDecoder("utf-16le", options);
    }
    return new FullTextDecoder(label ?? "utf-8", options);
  }
  CompatTextDecoder.prototype = FullTextDecoder.prototype;

  function CompatTextEncoder(options) {
    return new FullTextEncoder(options);
  }
  CompatTextEncoder.prototype = FullTextEncoder.prototype;

  global.TextDecoder = CompatTextDecoder;
  global.TextEncoder = CompatTextEncoder;

  if (!nativeTextDecoderSupportsUtf16Le()) {
    throw new Error(
      "TextDecoder utf-16le polyfill failed — mobile crypto cannot load."
    );
  }
}

/**
 * Must run AFTER `expo/src/Expo.fx` — Expo winter overwrites TextDecoder with utf-8-only.
 */
function ensureTextEncodingPolyfill() {
  if (!nativeTextDecoderSupportsUtf16Le()) {
    installTextEncodingPolyfill();
  }
}

module.exports = {
  installTextEncodingPolyfill,
  ensureTextEncodingPolyfill,
  nativeTextDecoderSupportsUtf16Le,
};
