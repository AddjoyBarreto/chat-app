import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const gatewayDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(gatewayDir, "../../..");

// Local: `.env` / `.env.local`. Production (Fly etc.): `.env.production` or platform env.
const isProd =
  process.env.NODE_ENV === "production" || process.env.VAULTCHAT_ENV === "production";
const envFiles = isProd
  ? [".env.production", ".env.production.local"]
  : [".env", ".env.local"];

for (const name of envFiles) {
  const envPath = path.join(repoRoot, name);
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}
