import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(rootDir, "../..");

// Load DATABASE_URL, JWT_SECRET, etc. from repo-root .env (not only apps/web/.env)
for (const envFile of [".env", ".env.local"]) {
  const envPath = path.join(monorepoRoot, envFile);
  if (existsSync(envPath)) loadEnv({ path: envPath, override: false });
}

const nextConfig: NextConfig = {
  transpilePackages: [
    "@vaultchat/api-core",
    "@vaultchat/protocol",
    "@vaultchat/crypto",
    "@vaultchat/client",
  ],
  outputFileTracingRoot: path.join(rootDir, "../.."),
};

export default nextConfig;
