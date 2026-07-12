/**
 * Shared defaults for one-off Node scripts under /scripts.
 * Scripts should import from here instead of scattering process.env reads.
 */

export const scriptEnv = Object.freeze({
  databaseUrl:
    process.env.DATABASE_URL?.trim() ||
    "postgres://vaultchat:vaultchat@localhost:5432/vaultchat",
  apiBaseUrl: process.env.API_BASE_URL?.trim() || "http://localhost:3000",
});
