#!/usr/bin/env node
/**
 * Free a TCP port before starting dev servers.
 * Usage: node scripts/free-port.mjs 3002
 */
import { execSync } from "node:child_process";

const port = process.argv[2];
if (!port || !/^\d+$/.test(port)) {
  console.error("Usage: node scripts/free-port.mjs <port>");
  process.exit(1);
}

try {
  const out = execSync(`lsof -ti :${port}`, { encoding: "utf8" }).trim();
  if (!out) process.exit(0);

  const pids = [...new Set(out.split("\n").filter(Boolean))];
  console.log(`Port ${port} is in use (PID ${pids.join(", ")}). Stopping…`);
  for (const pid of pids) {
    try {
      execSync(`kill ${pid}`);
    } catch {
      execSync(`kill -9 ${pid}`);
    }
  }
  // Brief pause so the OS releases the port
  execSync("sleep 0.5");
} catch {
  // lsof exits 1 when nothing is listening — port is free
}
