import {
  createApiContext,
  setEmailConfig,
  setMediaConfig,
  setTurnConfig,
  toApiError,
  verifyToken,
  type ApiContext,
} from "@vaultchat/api-core";

const globalForApi = globalThis as unknown as {
  vaultchatApiCtx?: ApiContext;
};

export function getApiContext(): ApiContext {
  if (!globalForApi.vaultchatApiCtx) {
    const databaseUrl = process.env.DATABASE_URL;
    const redisUrl = process.env.REDIS_URL;
    const jwtSecret = process.env.JWT_SECRET;

    if (!databaseUrl || !redisUrl || !jwtSecret) {
      throw new Error("Missing DATABASE_URL, REDIS_URL, or JWT_SECRET");
    }

    globalForApi.vaultchatApiCtx = createApiContext({ databaseUrl, redisUrl, jwtSecret });

    setMediaConfig({
      r2AccountId: process.env.R2_ACCOUNT_ID,
      r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
      r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      r2Bucket: process.env.R2_BUCKET,
      localMediaPath: process.env.LOCAL_MEDIA_PATH,
      apiBaseUrl: process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL,
    });

    setTurnConfig({
      turnUrls: process.env.TURN_URL,
      turnSecret: process.env.TURN_SECRET,
      stunUrls: process.env.STUN_URL ?? "stun:stun.l.google.com:19302",
    });

    setEmailConfig({
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      smtpFrom: process.env.SMTP_FROM,
      secure:
        process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1"
          ? true
          : process.env.SMTP_SECURE === "false" || process.env.SMTP_SECURE === "0"
            ? false
            : undefined,
      appBaseUrl:
        process.env.API_BASE_URL ??
        process.env.NEXT_PUBLIC_API_BASE_URL ??
        "http://localhost:3000",
    });
  }
  return globalForApi.vaultchatApiCtx;
}

export { toApiError, verifyToken };

export async function getAuthFromHeader(
  authorization: string | null
): Promise<{ userId: string; deviceId: number }> {
  if (!authorization?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  const token = authorization.slice(7);
  const claims = await verifyToken(getApiContext().jwtSecret, token);
  return { userId: claims.sub, deviceId: claims.deviceId };
}
