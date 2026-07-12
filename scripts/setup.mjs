#!/usr/bin/env node
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envExample = path.join(root, ".env.example");
const envFile = path.join(root, ".env");
const prodExample = path.join(root, ".env.production.example");
const prodFile = path.join(root, ".env.production");

if (!existsSync(envFile) && existsSync(envExample)) {
  copyFileSync(envExample, envFile);
  console.log("Created .env from .env.example — local Docker secrets.");
}
if (!existsSync(prodFile) && existsSync(prodExample)) {
  copyFileSync(prodExample, prodFile);
  console.log("Created .env.production from .env.production.example — fill before Vercel.");
}

console.log("Building workspace packages…");
execSync("pnpm exec turbo build --filter=@vaultchat/protocol --filter=@vaultchat/crypto --filter=@vaultchat/db --filter=@vaultchat/api-core --filter=@vaultchat/client", {
  cwd: root,
  stdio: "inherit",
});

console.log("\nSetup complete. Next:");
console.log("  pnpm infra:up");
console.log("  DATABASE_URL=postgres://vaultchat:vaultchat@localhost:5432/vaultchat pnpm db:migrate");
console.log("  pnpm dev:stack   # web + gateway");
