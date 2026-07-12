#!/usr/bin/env node
/**
 * Set Fly.io gateway secrets from `.env.production` without shell `$` expansion.
 *
 *   node scripts/fly-gateway-secrets.mjs
 *   node scripts/fly-gateway-secrets.mjs --api-base https://chat.addjoybarreto.com
 *
 * Requires: flyctl logged in (`fly auth login`)
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.production");
const config = path.join(root, "infra/fly/gateway.toml");

if (!existsSync(envPath)) {
  console.error("Missing .env.production");
  process.exit(1);
}

function loadEnvFile(filePath) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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
    out[key] = value;
  }
  return out;
}

const env = loadEnvFile(envPath);

const apiBaseArg = process.argv.findIndex((a) => a === "--api-base");
const apiBase =
  (apiBaseArg >= 0 ? process.argv[apiBaseArg + 1] : undefined) ||
  env.API_BASE_URL;

const required = ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "GATEWAY_PUSH_SECRET"];
for (const key of required) {
  if (!env[key]) {
    console.error(`Missing ${key} in .env.production`);
    process.exit(1);
  }
}

if (!apiBase || apiBase.includes("YOUR-APP")) {
  console.error(
    "Set a real API_BASE_URL in .env.production or pass --api-base https://your-domain",
  );
  process.exit(1);
}

if (/\$/.test(env.DATABASE_URL) && !/%24/.test(env.DATABASE_URL)) {
  console.error(
    "DATABASE_URL still has raw $ — use URL-encoded password (%24) from .env.production",
  );
  process.exit(1);
}

const pairs = [
  `DATABASE_URL=${env.DATABASE_URL}`,
  `REDIS_URL=${env.REDIS_URL}`,
  `JWT_SECRET=${env.JWT_SECRET}`,
  `GATEWAY_PUSH_SECRET=${env.GATEWAY_PUSH_SECRET}`,
  `API_BASE_URL=${apiBase}`,
];

console.log("Setting Fly secrets for vaultchat-gateway…");
const result = spawnSync(
  "fly",
  ["secrets", "set", ...pairs, "--config", config],
  { cwd: root, stdio: "inherit", shell: false },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("Done. Deploy with: fly deploy --config infra/fly/gateway.toml");
