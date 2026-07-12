import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(rootDir, "../..");

// Local: `.env` then `.env.local`. Production secrets: `.env.production` (Vercel dashboard
// usually injects these instead; file is for local reference / gateway / migrate).
const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const envFiles = isProd
  ? [".env.production", ".env.production.local"]
  : [".env", ".env.local"];
for (const envFile of envFiles) {
  const envPath = path.join(monorepoRoot, envFile);
  if (existsSync(envPath)) loadEnv({ path: envPath, override: false });
}

const nextConfig: NextConfig = {
  transpilePackages: [
    "@vaultchat/api-core",
    "@vaultchat/protocol",
    "@vaultchat/crypto",
    "@vaultchat/client",
    "@vaultchat/chat-react",
  ],
  outputFileTracingRoot: path.join(rootDir, "../.."),
  // libsignal/curve25519 Emscripten build references Node `fs`/`path` — unused in browser.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        buffer: false,
      };
    }
    return config;
  },
};

export default nextConfig;
