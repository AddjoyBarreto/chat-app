const { Buffer } = require("buffer");

global.Buffer = Buffer;

// Clear host globals so we don't accidentally capture Expo's utf-8-only build.
try {
  delete global.TextDecoder;
} catch (_) {}
try {
  delete global.TextEncoder;
} catch (_) {}

// encoding.js attaches to its IIFE `global` (module `this`), not always `globalThis`.
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

try {
  const probe = new global.TextDecoder("utf-16le");
  if (probe.encoding !== "utf-16le") {
    throw new Error(`expected utf-16le, got ${probe.encoding}`);
  }
} catch (err) {
  const msg = String(err);
  if (msg.includes("normalized:")) {
    throw new Error(
      "Expo utf-8-only TextDecoder is still active — polyfills must load before expo"
    );
  }
  throw new Error(`TextDecoder utf-16le polyfill failed — mobile crypto cannot load: ${msg}`);
}

try {
  Object.defineProperty(global, "TextDecoder", {
    value: CompatTextDecoder,
    writable: false,
    configurable: false,
    enumerable: true,
  });
  Object.defineProperty(global, "TextEncoder", {
    value: CompatTextEncoder,
    writable: false,
    configurable: false,
    enumerable: true,
  });
} catch (_) {
  // Host globals may be non-configurable; assignment above is sufficient.
}
