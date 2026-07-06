const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Monorepo + pnpm: ensure a single React copy (avoids ErrorOverlay child errors).
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, "node_modules/react"),
  "react/jsx-runtime": path.resolve(projectRoot, "node_modules/react/jsx-runtime"),
};

// Run crypto polyfills before the app entry on fast refresh.
config.serializer.getModulesRunBeforeMainModule = () => [
  path.resolve(projectRoot, "polyfills.js"),
];

module.exports = config;
