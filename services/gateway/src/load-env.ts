import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const gatewayDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(gatewayDir, "../../..");

for (const envPath of [path.join(repoRoot, ".env"), path.join(repoRoot, ".env.local")]) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}
