import { createHmac } from "node:crypto";
import type { CallType, IceServersResponse } from "@vaultchat/protocol";
import type { ApiContext } from "./context.js";

export interface TurnConfig {
  turnUrls?: string;
  turnSecret?: string;
  stunUrls?: string;
}

let turnConfig: TurnConfig = {
  stunUrls: "stun:stun.l.google.com:19302",
};

export function setTurnConfig(config: TurnConfig) {
  turnConfig = { ...turnConfig, ...config };
}

function buildTurnCredential(userId: string): { username: string; credential: string } {
  const secret = turnConfig.turnSecret ?? "dev-turn-secret";
  const ttl = 86_400;
  const username = `${Math.floor(Date.now() / 1000) + ttl}:${userId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}

export function getIceServers(userId: string): IceServersResponse {
  const iceServers: IceServersResponse["iceServers"] = [];

  const stunList = (turnConfig.stunUrls ?? "stun:stun.l.google.com:19302").split(",");
  for (const url of stunList) {
    iceServers.push({ urls: url.trim() });
  }

  if (turnConfig.turnUrls) {
    const { username, credential } = buildTurnCredential(userId);
    const turnList = turnConfig.turnUrls.split(",");
    for (const url of turnList) {
      iceServers.push({
        urls: url.trim(),
        username,
        credential,
      });
    }
  }

  return { iceServers };
}

export async function notifyIncomingCall(
  ctx: ApiContext,
  calleeId: string,
  callerId: string,
  callType: CallType,
  callId: string
): Promise<void> {
  const { sendPushToUser } = await import("./push.js");
  await sendPushToUser(ctx, calleeId, "VaultChat", "Incoming call", {
    type: "incoming_call",
    callerId,
    callType,
    callId,
  });
}
