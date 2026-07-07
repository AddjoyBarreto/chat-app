import {
  isConnectedPresence,
  listFriendIds,
  presenceRedisKey,
  PRESENCE_TTL_SEC,
  publicPresenceStatus,
  type ApiContext,
} from "@vaultchat/api-core";
import type { FriendPresence, PresenceStatus, SettablePresenceStatus, WsServerEvent } from "@vaultchat/protocol";
import type Redis from "ioredis";
import type { WebSocket } from "ws";

type SendToUser = (targetUserId: string, event: WsServerEvent) => boolean;
type ClientsByUser = Map<string, Set<WebSocket>>;

function isUserOnline(clientsByUser: ClientsByUser, userId: string): boolean {
  const set = clientsByUser.get(userId);
  return Boolean(set && set.size > 0);
}

async function loadPresence(redis: Redis, userId: string): Promise<PresenceStatus> {
  const raw = await redis.get(presenceRedisKey(userId));
  if (!raw) return "offline";
  if (raw === "online" || raw === "idle" || raw === "busy" || raw === "invisible" || raw === "offline") {
    return raw;
  }
  return "offline";
}

async function savePresence(redis: Redis, userId: string, status: PresenceStatus): Promise<void> {
  await redis.set(presenceRedisKey(userId), status, "EX", PRESENCE_TTL_SEC);
}

async function buildFriendPresenceSnapshot(
  redis: Redis,
  clientsByUser: ClientsByUser,
  friendIds: string[]
): Promise<FriendPresence[]> {
  const friends: FriendPresence[] = [];
  for (const friendId of friendIds) {
    if (!isUserOnline(clientsByUser, friendId)) continue;
    const stored = await loadPresence(redis, friendId);
    const status = stored === "offline" ? "online" : publicPresenceStatus(stored);
    friends.push({ userId: friendId, status });
  }
  return friends;
}

async function notifyFriendsOfPresence(
  ctx: ApiContext,
  redis: Redis,
  userId: string,
  clientsByUser: ClientsByUser,
  sendToUser: SendToUser
): Promise<void> {
  const stored = await loadPresence(redis, userId);
  const status = publicPresenceStatus(stored === "offline" ? "online" : stored);
  const friendIds = await listFriendIds(ctx, userId);
  for (const friendId of friendIds) {
    if (isUserOnline(clientsByUser, friendId)) {
      sendToUser(friendId, { type: "presence_update", userId, status });
    }
  }
}

/** Notify friends and send an initial snapshot to the connecting socket. */
export async function handleUserConnected(
  ctx: ApiContext,
  redis: Redis,
  userId: string,
  ws: WebSocket,
  clientsByUser: ClientsByUser,
  send: (socket: WebSocket, event: WsServerEvent) => void,
  sendToUser: SendToUser
): Promise<void> {
  const set = clientsByUser.get(userId);
  if (!set) return;

  const friendIds = await listFriendIds(ctx, userId);
  const snapshot = await buildFriendPresenceSnapshot(redis, clientsByUser, friendIds);
  send(ws, { type: "presence_snapshot", friends: snapshot });

  if (set.size !== 1) return;

  let status = await loadPresence(redis, userId);
  if (!isConnectedPresence(status)) status = "online";
  await savePresence(redis, userId, status);
  await notifyFriendsOfPresence(ctx, redis, userId, clientsByUser, sendToUser);
}

/** Notify friends when the user's last socket disconnects. */
export async function handleUserDisconnected(
  ctx: ApiContext,
  redis: Redis,
  userId: string,
  clientsByUser: ClientsByUser,
  sendToUser: SendToUser
): Promise<void> {
  if (isUserOnline(clientsByUser, userId)) return;

  await savePresence(redis, userId, "offline");

  const friendIds = await listFriendIds(ctx, userId);
  for (const friendId of friendIds) {
    sendToUser(friendId, { type: "presence_update", userId, status: "offline" });
  }
}

export async function handlePresenceSet(
  ctx: ApiContext,
  redis: Redis,
  userId: string,
  status: SettablePresenceStatus,
  clientsByUser: ClientsByUser,
  sendToUser: SendToUser
): Promise<void> {
  if (!isUserOnline(clientsByUser, userId)) return;

  await savePresence(redis, userId, status);
  await notifyFriendsOfPresence(ctx, redis, userId, clientsByUser, sendToUser);
}
