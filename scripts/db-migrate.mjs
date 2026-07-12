#!/usr/bin/env node
/**
 * Load repo-root env safely (no shell `$` expansion), then run drizzle-kit migrate.
 *
 *   pnpm db:migrate          → .env (local Docker)
 *   pnpm db:migrate:prod     → .env.production (Supabase)
 */
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const useProd =
  process.argv.includes("--production") || process.env.VAULTCHAT_ENV === "production";
const envFile = useProd ? ".env.production" : ".env";
const envPath = path.join(root, envFile);

if (!existsSync(envPath)) {
  console.error(`Missing ${envFile} at repo root.`);
  process.exit(1);
}

/** Minimal .env loader — does not expand $VARS (critical for passwords with $). */
function loadEnvFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(envPath);

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(`No DIRECT_URL or DATABASE_URL in ${envFile}`);
  process.exit(1);
}

if (/:!62WEc\*j@|:!62WEcj@/.test(url)) {
  console.error(
    `Database URL looks corrupted (password $ chars were eaten). Fix encoding in ${envFile}:\n` +
      `  use %2162WEc%24rM3xL%2Aj%24 instead of raw !62WEc$rM3xL*j$\n` +
      `  and run: pnpm db:migrate:prod  (do not shell-source the env file)`,
  );
  process.exit(1);
}

console.log(`Migrating with ${envFile}…`);
execSync("pnpm --filter @vaultchat/db migrate", {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
