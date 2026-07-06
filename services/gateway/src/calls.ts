import type { CallType, WsClientEvent, WsServerEvent } from "@vaultchat/protocol";

const RING_TIMEOUT_MS = 45_000;

async function notifyCallPush(
  calleeId: string,
  callerId: string,
  callType: CallType,
  callId: string
) {
  const apiBase = process.env.API_BASE_URL;
  const secret = process.env.GATEWAY_PUSH_SECRET;
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

interface CallSession {
  callId: string;
  callerId: string;
  calleeId: string;
  callType: CallType;
  state: "ringing" | "active" | "ended";
}

const calls = new Map<string, CallSession>();

export function getCall(callId: string): CallSession | undefined {
  return calls.get(callId);
}

function isParticipant(call: CallSession, userId: string): boolean {
  return call.callerId === userId || call.calleeId === userId;
}

function peerId(call: CallSession, userId: string): string {
  return call.callerId === userId ? call.calleeId : call.callerId;
}

export function handleCallEvent(
  userId: string,
  event: WsClientEvent,
  sendToUser: (targetUserId: string, payload: WsServerEvent) => boolean
): WsServerEvent | null {
  switch (event.type) {
    case "call_invite": {
      if (event.calleeId === userId) return { type: "error", error: "Cannot call yourself" };
      if (calls.has(event.callId)) return { type: "error", error: "Call already exists" };

      calls.set(event.callId, {
        callId: event.callId,
        callerId: userId,
        calleeId: event.calleeId,
        callType: event.callType,
        state: "ringing",
      });

      const delivered = sendToUser(event.calleeId, {
        type: "call_incoming",
        callId: event.callId,
        callerId: userId,
        callType: event.callType,
      });

      void notifyCallPush(event.calleeId, userId, event.callType, event.callId);

      setTimeout(() => {
        const pending = calls.get(event.callId);
        if (!pending || pending.state !== "ringing") return;
        sendToUser(pending.callerId, { type: "call_ended", callId: event.callId, reason: "no_answer" });
        calls.delete(event.callId);
      }, RING_TIMEOUT_MS);

      return null;
    }

    case "call_accept": {
      const call = calls.get(event.callId);
      if (!call || !isParticipant(call, userId) || call.state !== "ringing") {
        return { type: "error", error: "Invalid call" };
      }
      if (userId !== call.calleeId) {
        return { type: "error", error: "Only callee can accept" };
      }
      call.state = "active";
      sendToUser(call.callerId, { type: "call_accepted", callId: call.callId, peerId: userId });
      return null;
    }

    case "call_reject": {
      const call = calls.get(event.callId);
      if (!call || !isParticipant(call, userId)) {
        return { type: "error", error: "Invalid call" };
      }
      sendToUser(peerId(call, userId), {
        type: "call_rejected",
        callId: event.callId,
        reason: event.reason,
      });
      calls.delete(event.callId);
      return null;
    }

    case "call_offer":
    case "call_answer":
    case "call_ice": {
      const call = calls.get(event.callId);
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
      const call = calls.get(event.callId);
      if (!call || !isParticipant(call, userId)) {
        return { type: "error", error: "Invalid call" };
      }
      const other = peerId(call, userId);
      sendToUser(other, { type: "call_ended", callId: event.callId });
      calls.delete(event.callId);
      return null;
    }

    default:
      return null;
  }
}

export function cleanupCallsForUser(
  userId: string,
  sendToUser: (targetUserId: string, payload: WsServerEvent) => boolean
) {
  for (const [callId, call] of calls) {
    if (call.callerId !== userId && call.calleeId !== userId) continue;
    const other = peerId(call, userId);
    sendToUser(other, { type: "call_ended", callId, reason: "disconnected" });
    calls.delete(callId);
  }
}
