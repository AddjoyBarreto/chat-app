#!/usr/bin/env node
/**
 * Wipe all VaultChat application data from Postgres (users, messages, keys, etc.).
 * Does NOT drop schema — run migrations afterward if needed.
 *
 * Usage: DATABASE_URL=postgres://... node scripts/db-reset.mjs
 */
import { execSync } from "node:child_process";
import { scriptEnv } from "./env.mjs";

const url = scriptEnv.databaseUrl;

const TABLES = [
  "voice_presence",
  "channel_read_state",
  "conversation_read_state",
  "account_key_backups",
  "channel_messages",
  "channels",
  "channel_categories",
  "invites",
  "blocks",
  "friendships",
  "friend_requests",
  "user_privacy_settings",
  "group_messages",
  "group_members",
  "groups",
  "push_tokens",
  "media_files",
  "conversations",
  "messages",
  "one_time_pre_keys",
  "signed_pre_keys",
  "devices",
  "email_verification_tokens",
  "users",
];

const sql = `TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`;

try {
  execSync(`psql "${url}" -v ON_ERROR_STOP=1 -c ${JSON.stringify(sql)}`, {
    stdio: "inherit",
  });
  console.log("Database reset complete — all users and records removed.");
} catch (err) {
  console.error("Database reset failed. Is psql installed and Postgres running?");
  process.exit(1);
}
