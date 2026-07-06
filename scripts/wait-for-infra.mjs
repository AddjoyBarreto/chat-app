#!/usr/bin/env node
import { execSync } from "node:child_process";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const services = ["postgres", "redis"];
const maxAttempts = 30;

for (const service of services) {
  let ready = false;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = execSync(
        `docker compose -f infra/docker/docker-compose.yml ps --status running --format json ${service}`,
        { encoding: "utf8" }
      ).trim();
      if (status) {
        ready = true;
        break;
      }
    } catch {
      // container not up yet
    }
    sleep(1000);
  }
  if (!ready) {
    console.error(`Timed out waiting for ${service}. Is Docker running?`);
    process.exit(1);
  }
  console.log(`${service} is up`);
}

console.log("Infrastructure ready.");
