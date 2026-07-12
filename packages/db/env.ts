/**
 * DB CLI env (drizzle-kit migrate / generate / studio).
 * Prefer DIRECT_URL for migrations when using PgBouncer transaction pooling.
 */

const LOCAL_DEFAULT = "postgres://vaultchat:vaultchat@localhost:5432/vaultchat";

/** Supabase (and most cloud PG) require TLS; drizzle-kit won't add it for you. */
export function ensureSslMode(url: string): string {
  if (!/supabase\.co|neon\.tech|amazonaws\.com/i.test(url)) return url;
  if (/[?&]sslmode=/i.test(url)) return url;
  return url.includes("?") ? `${url}&sslmode=require` : `${url}?sslmode=require`;
}

export function getDrizzleDatabaseUrl(): string {
  const raw =
    process.env.DIRECT_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    LOCAL_DEFAULT;
  return ensureSslMode(raw);
}
