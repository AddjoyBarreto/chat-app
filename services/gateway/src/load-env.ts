/**
 * Load repo-root env files when present (local dev).
 * On Fly, secrets come from the platform env — file load is best-effort only.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

const isProd =
  process.env.NODE_ENV === "production" || process.env.VAULTCHAT_ENV === "production";
const envFiles = isProd
  ? [".env.production", ".env.production.local"]
  : [".env", ".env.local"];

const searchRoots = [
  process.cwd(),
  path.resolve(process.cwd(), "../.."),
  path.resolve(process.cwd(), "../../.."),
];

for (const root of searchRoots) {
  for (const name of envFiles) {
    const envPath = path.join(root, name);
    if (existsSync(envPath)) {
      config({ path: envPath, override: false });
    }
  }
}
