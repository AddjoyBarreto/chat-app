/**
 * Gateway process env. Import only after `./load-env.js` so `.env` files are loaded.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export const gatewayEnv = Object.freeze({
  port: Number(process.env.PORT ?? 3001),
  redisUrl: optional("REDIS_URL") ?? "redis://localhost:6379",
  jwtSecret: required("JWT_SECRET"),
  databaseUrl: required("DATABASE_URL"),
  apiBaseUrl: optional("API_BASE_URL"),
  gatewayPushSecret: optional("GATEWAY_PUSH_SECRET"),
});

export type GatewayEnv = typeof gatewayEnv;
