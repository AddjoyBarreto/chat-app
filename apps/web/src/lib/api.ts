import {
  createApiContext,
  setEmailConfig,
  setMediaConfig,
  setTurnConfig,
  toApiError,
  verifyToken,
  type ApiContext,
} from "@vaultchat/api-core";
import { serverEnv } from "@/env/server";

const globalForApi = globalThis as unknown as {
  vaultchatApiCtx?: ApiContext;
};

export function getApiContext(): ApiContext {
  if (!globalForApi.vaultchatApiCtx) {
    globalForApi.vaultchatApiCtx = createApiContext({
      databaseUrl: serverEnv.databaseUrl,
      redisUrl: serverEnv.redisUrl,
      jwtSecret: serverEnv.jwtSecret,
    });

    setMediaConfig(serverEnv.media);
    setTurnConfig(serverEnv.turn);
    setEmailConfig(serverEnv.smtp);
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
