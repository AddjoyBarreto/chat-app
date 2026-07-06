// Polyfills must be the very first require — before metro-runtime or expo.
require("./polyfills");
require("@expo/metro-runtime");
require("expo/src/Expo.fx");
const { App } = require("expo-router/build/qualified-entry");
const { renderRootComponent } = require("expo-router/build/renderRootComponent");

renderRootComponent(App);
