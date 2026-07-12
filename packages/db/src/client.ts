import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

type PostgresClient = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  vaultchatPgClients?: Map<string, PostgresClient>;
  vaultchatDbs?: Map<string, Database>;
};

/** Transaction-mode PgBouncer (Supabase :6543) rejects prepared statements. */
function usesTransactionPooler(connectionString: string): boolean {
  try {
    const u = new URL(connectionString);
    if (u.port === "6543") return true;
    if (u.searchParams.get("pgbouncer") === "true") return true;
  } catch {
    // fall through
  }
  return /[?&]pgbouncer=true\b/i.test(connectionString) || /:6543\b/.test(connectionString);
}

function getPgClient(connectionString: string): PostgresClient {
  if (!globalForDb.vaultchatPgClients) {
    globalForDb.vaultchatPgClients = new Map();
  }

  const existing = globalForDb.vaultchatPgClients.get(connectionString);
  if (existing) return existing;

  const client = postgres(connectionString, {
    // Keep pools small — Next.js dev HMR can spawn multiple module instances.
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: !usesTransactionPooler(connectionString),
  });

  globalForDb.vaultchatPgClients.set(connectionString, client);
  return client;
}

export function createDb(connectionString: string): Database {
  if (!globalForDb.vaultchatDbs) {
    globalForDb.vaultchatDbs = new Map();
  }

  const existing = globalForDb.vaultchatDbs.get(connectionString);
  if (existing) return existing;

  const db = drizzle(getPgClient(connectionString), { schema });
  globalForDb.vaultchatDbs.set(connectionString, db);
  return db;
}
