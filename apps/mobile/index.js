const { ensureTextEncodingPolyfill } = require("./polyfills");

require("@expo/metro-runtime");
require("expo/src/Expo.fx");

// Expo winter installs a utf-8-only TextDecoder — replace for Signal/crypto utf-16le.
ensureTextEncodingPolyfill();

const { App } = require("expo-router/build/qualified-entry");
const { renderRootComponent } = require("expo-router/build/renderRootComponent");

renderRootComponent(App);
