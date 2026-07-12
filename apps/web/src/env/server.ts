/**
 * Server-only environment. Do not import from Client Components or shared
 * browser code — these values include secrets.
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

function parseSmtpSecure(): boolean | undefined {
  const raw = process.env.SMTP_SECURE;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return undefined;
}

const apiBaseUrl =
  optional("API_BASE_URL") ?? optional("NEXT_PUBLIC_API_BASE_URL") ?? "http://localhost:3000";

export const serverEnv = Object.freeze({
  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),
  jwtSecret: required("JWT_SECRET"),

  apiBaseUrl,
  gatewayPushSecret: optional("GATEWAY_PUSH_SECRET"),

  media: Object.freeze({
    r2AccountId: optional("R2_ACCOUNT_ID"),
    r2AccessKeyId: optional("R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
    r2Bucket: optional("R2_BUCKET"),
    localMediaPath: optional("LOCAL_MEDIA_PATH"),
    apiBaseUrl,
  }),

  turn: Object.freeze({
    turnUrls: optional("TURN_URL"),
    turnSecret: optional("TURN_SECRET"),
    stunUrls: optional("STUN_URL") ?? "stun:stun.l.google.com:19302",
  }),

  smtp: Object.freeze({
    smtpHost: optional("SMTP_HOST"),
    smtpPort: optional("SMTP_PORT") ? Number(process.env.SMTP_PORT) : undefined,
    smtpUser: optional("SMTP_USER"),
    smtpPass: optional("SMTP_PASS"),
    smtpFrom: optional("SMTP_FROM"),
    secure: parseSmtpSecure(),
    appBaseUrl: apiBaseUrl,
    skipEmailVerification: process.env.SKIP_EMAIL_VERIFICATION === "true",
  }),
});

export type ServerEnv = typeof serverEnv;
