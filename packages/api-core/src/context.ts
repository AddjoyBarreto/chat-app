import type { Database } from "@vaultchat/db";
import type Redis from "ioredis";

export interface ApiContext {
  db: Database;
  redis: Redis;
  jwtSecret: string;
}
