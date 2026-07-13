import type { CallType } from "@vaultchat/protocol";
import type Redis from "ioredis";

const CALL_KEY_PREFIX = "vaultchat:call:";
const CALL_USER_PREFIX = "vaultchat:call:user:";
/** Ringing calls expire with the ring timeout. */
const RINGING_CALL_TTL_SEC = 45;
/** Active calls are refreshed on signaling; this is a safety net if both sides vanish. */
const ACTIVE_CALL_TTL_SEC = 3_600;

export interface CallSession {
  callId: string;
  callerId: string;
  calleeId: string;
  callType: CallType;
  state: "ringing" | "active" | "ended";
}

function callKey(callId: string) {
  return `${CALL_KEY_PREFIX}${callId}`;
}

function userCallsKey(userId: string) {
  return `${CALL_USER_PREFIX}${userId}`;
}

function ttlForCall(call: CallSession): number {
  return call.state === "ringing" ? RINGING_CALL_TTL_SEC : ACTIVE_CALL_TTL_SEC;
}

export async function getCall(redis: Redis, callId: string): Promise<CallSession | undefined> {
  const raw = await redis.get(callKey(callId));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as CallSession;
  } catch {
    return undefined;
  }
}

export async function saveCall(redis: Redis, call: CallSession): Promise<void> {
  const key = callKey(call.callId);
  const ttl = ttlForCall(call);
  await redis
    .multi()
    .set(key, JSON.stringify(call), "EX", ttl)
    .sadd(userCallsKey(call.callerId), call.callId)
    .expire(userCallsKey(call.callerId), ttl)
    .sadd(userCallsKey(call.calleeId), call.callId)
    .expire(userCallsKey(call.calleeId), ttl)
    .exec();
}

/** Extend Redis TTL while an active call is still exchanging signaling. */
export async function touchCall(redis: Redis, call: CallSession): Promise<void> {
  if (call.state !== "active") return;
  const ttl = ACTIVE_CALL_TTL_SEC;
  await redis
    .multi()
    .expire(callKey(call.callId), ttl)
    .expire(userCallsKey(call.callerId), ttl)
    .expire(userCallsKey(call.calleeId), ttl)
    .exec();
}

export async function deleteCall(redis: Redis, call: CallSession): Promise<void> {
  await redis
    .multi()
    .del(callKey(call.callId))
    .srem(userCallsKey(call.callerId), call.callId)
    .srem(userCallsKey(call.calleeId), call.callId)
    .exec();
}

export async function listCallsForUser(redis: Redis, userId: string): Promise<CallSession[]> {
  const callIds = await redis.smembers(userCallsKey(userId));
  const calls: CallSession[] = [];
  for (const callId of callIds) {
    const call = await getCall(redis, callId);
    if (call) calls.push(call);
    else await redis.srem(userCallsKey(userId), callId);
  }
  return calls;
}
