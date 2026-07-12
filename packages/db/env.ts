/**
 * DB CLI env (drizzle-kit migrate / generate / studio).
 * Prefer DIRECT_URL for migrations when using PgBouncer transaction pooling.
 */

const LOCAL_DEFAULT = "postgres://vaultchat:vaultchat@localhost:5432/vaultchat";

export function getDrizzleDatabaseUrl(): string {
  return (
    process.env.DIRECT_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    LOCAL_DEFAULT
  );
}
