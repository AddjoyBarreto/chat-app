import type { CallType, WsClientEvent, WsServerEvent } from "@vaultchat/protocol";
import type Redis from "ioredis";
import {
  deleteCall,
  getCall,
  listCallsForUser,
  saveCall,
  type CallSession,
} from "./call-store.js";
import { gatewayEnv } from "./env.js";

const RING_TIMEOUT_MS = 45_000;

async function notifyCallPush(
  calleeId: string,
  callerId: string,
  callType: CallType,
  callId: string
) {
  const apiBase = gatewayEnv.apiBaseUrl;
  const secret = gatewayEnv.gatewayPushSecret;
  if (!apiBase || !secret) return;

  try {
    await fetch(`${apiBase}/api/v1/calls/notify-incoming`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-secret": secret,
      },
      body: JSON.stringify({ calleeId, callerId, callType, callId }),
    });
  } catch (err) {
    console.error("Call push notification failed:", err);
  }
}

function isParticipant(call: CallSession, userId: string): boolean {
  return call.callerId === userId || call.calleeId === userId;
}

function peerId(call: CallSession, userId: string): string {
  return call.callerId === userId ? call.calleeId : call.callerId;
}

export async function handleCallEvent(
  redis: Redis,
  userId: string,
  event: WsClientEvent,
  sendToUser: (targetUserId: string, payload: WsServerEvent) => boolean
): Promise<WsServerEvent | null> {
  switch (event.type) {
    case "call_invite": {
      if (event.calleeId === userId) return { type: "error", error: "Cannot call yourself" };
      const existing = await getCall(redis, event.callId);
      if (existing) return { type: "error", error: "Call already exists" };

      const call: CallSession = {
        callId: event.callId,
        callerId: userId,
        calleeId: event.calleeId,
        callType: event.callType,
        state: "ringing",
      };
      await saveCall(redis, call);

      const delivered = sendToUser(event.calleeId, {
        type: "call_incoming",
        callId: event.callId,
        callerId: userId,
        callType: event.callType,
      });

      if (!delivered) {
        await deleteCall(redis, call);
        sendToUser(userId, {
          type: "call_ended",
          callId: event.callId,
          reason: "unavailable",
        });
        return { type: "error", error: "User is offline" };
      }

      void notifyCallPush(event.calleeId, userId, event.callType, event.callId);

      setTimeout(() => {
        void (async () => {
          const pending = await getCall(redis, event.callId);
          if (!pending || pending.state !== "ringing") return;
          sendToUser(pending.callerId, {
            type: "call_ended",
            callId: event.callId,
            reason: "no_answer",
          });
          sendToUser(pending.calleeId, {
            type: "call_ended",
            callId: event.callId,
            reason: "no_answer",
          });
          await deleteCall(redis, pending);
        })();
      }, RING_TIMEOUT_MS);

      return null;
    }

    case "call_accept": {
      const call = await getCall(redis, event.callId);
      if (!call || !isParticipant(call, userId) || call.state !== "ringing") {
        return { type: "error", error: "Invalid call" };
      }
      if (userId !== call.calleeId) {
        return { type: "error", error: "Only callee can accept" };
      }
      call.state = "active";
      await saveCall(redis, call);
      sendToUser(call.callerId, { type: "call_accepted", callId: call.callId, peerId: userId });
      return null;
    }

    case "call_reject": {
      const call = await getCall(redis, event.callId);
      if (!call || !isParticipant(call, userId)) {
        return { type: "error", error: "Invalid call" };
      }
      sendToUser(peerId(call, userId), {
        type: "call_rejected",
        callId: event.callId,
        reason: event.reason,
      });
      await deleteCall(redis, call);
      return null;
    }

    case "call_offer":
    case "call_answer":
    case "call_ice": {
      const call = await getCall(redis, event.callId);
      if (!call || !isParticipant(call, userId) || call.state === "ended") {
        return { type: "error", error: "Invalid call" };
      }
      const target = peerId(call, userId);
      if (event.type === "call_offer") {
        sendToUser(target, { type: "call_offer", callId: event.callId, sdp: event.sdp });
      } else if (event.type === "call_answer") {
        sendToUser(target, { type: "call_answer", callId: event.callId, sdp: event.sdp });
      } else {
        sendToUser(target, { type: "call_ice", callId: event.callId, candidate: event.candidate });
      }
      return null;
    }

    case "call_end": {
      const call = await getCall(redis, event.callId);
      if (!call || !isParticipant(call, userId)) {
        return { type: "error", error: "Invalid call" };
      }
      const other = peerId(call, userId);
      sendToUser(other, { type: "call_ended", callId: event.callId });
      await deleteCall(redis, call);
      return null;
    }

    default:
      return null;
  }
}

export async function cleanupCallsForUser(
  redis: Redis,
  userId: string,
  sendToUser: (targetUserId: string, payload: WsServerEvent) => boolean
) {
  const active = await listCallsForUser(redis, userId);
  for (const call of active) {
    const other = peerId(call, userId);
    sendToUser(other, { type: "call_ended", callId: call.callId, reason: "disconnected" });
    await deleteCall(redis, call);
  }
}
