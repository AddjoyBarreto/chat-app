const { ensureTextEncodingPolyfill } = require("./polyfills");
const { ensureWebCryptoPolyfill } = require("./webcrypto-polyfill");

require("@expo/metro-runtime");
require("expo/src/Expo.fx");

// Expo winter replaces TextDecoder and may touch crypto — reinstall after Expo loads.
ensureTextEncodingPolyfill();
ensureWebCryptoPolyfill();

const { App } = require("expo-router/build/qualified-entry");
const { renderRootComponent } = require("expo-router/build/renderRootComponent");

renderRootComponent(App);
