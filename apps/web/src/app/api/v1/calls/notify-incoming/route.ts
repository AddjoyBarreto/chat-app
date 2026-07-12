import { notifyIncomingCall } from "@vaultchat/api-core";
import type { CallType } from "@vaultchat/protocol";
import { serverEnv } from "@/env/server";
import { getApiContext, toApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";

export async function POST(request: Request) {
  try {
    const secret = serverEnv.gatewayPushSecret;
    if (!secret || request.headers.get("x-gateway-secret") !== secret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = (await request.json()) as {
      calleeId: string;
      callerId: string;
      callType: CallType;
      callId: string;
    };

    const ctx = getApiContext();
    await notifyIncomingCall(
      ctx,
      body.calleeId,
      body.callerId,
      body.callType,
      body.callId
    );
    return jsonResponse({ ok: true });
  } catch (err) {
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
