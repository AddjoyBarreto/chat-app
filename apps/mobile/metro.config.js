const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Monorepo + pnpm: watch workspace root and resolve hoisted deps.
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Single React copy (avoids duplicate React in monorepo).
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, "node_modules/react"),
  "react/jsx-runtime": path.resolve(projectRoot, "node_modules/react/jsx-runtime"),
};

// Buffer before main; TextDecoder + WebCrypto patched in index.js after Expo.fx.
config.serializer.getModulesRunBeforeMainModule = () => [
  path.resolve(projectRoot, "polyfills.js"),
];

module.exports = config;
