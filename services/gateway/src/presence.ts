import {
  isConnectedPresence,
  listFriendIds,
  listSharedGroupMemberIds,
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
  return hasOpenSocket(clientsByUser, userId);
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

/** Keep presence alive while the client is heartbeating. */
export async function touchPresence(redis: Redis, userId: string): Promise<void> {
  const key = presenceRedisKey(userId);
  const updated = await redis.expire(key, PRESENCE_TTL_SEC);
  if (updated === 0) {
    // Key expired while the socket was still up — restore a connected status.
    await redis.set(key, "online", "EX", PRESENCE_TTL_SEC);
  }
}

function hasOpenSocket(clientsByUser: ClientsByUser, userId: string): boolean {
  const set = clientsByUser.get(userId);
  if (!set || set.size === 0) return false;
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) return true;
  }
  return false;
}

/** Friends + shared group/community members — everyone who should see your status. */
async function listPresencePeerIds(ctx: ApiContext, userId: string): Promise<string[]> {
  const [friendIds, groupPeerIds] = await Promise.all([
    listFriendIds(ctx, userId),
    listSharedGroupMemberIds(ctx, userId),
  ]);
  return [...new Set([...friendIds, ...groupPeerIds])];
}

async function buildPresenceSnapshot(
  redis: Redis,
  clientsByUser: ClientsByUser,
  peerIds: string[]
): Promise<FriendPresence[]> {
  const peers: FriendPresence[] = [];
  for (const peerId of peerIds) {
    if (!isUserOnline(clientsByUser, peerId)) continue;
    const stored = await loadPresence(redis, peerId);
    const status = stored === "offline" ? "online" : publicPresenceStatus(stored);
    if (status === "offline") continue;
    peers.push({ userId: peerId, status });
  }
  return peers;
}

async function notifyPeersOfPresence(
  ctx: ApiContext,
  redis: Redis,
  userId: string,
  clientsByUser: ClientsByUser,
  sendToUser: SendToUser
): Promise<void> {
  const stored = await loadPresence(redis, userId);
  const status = publicPresenceStatus(stored === "offline" ? "online" : stored);
  const peerIds = await listPresencePeerIds(ctx, userId);
  for (const peerId of peerIds) {
    if (isUserOnline(clientsByUser, peerId)) {
      sendToUser(peerId, { type: "presence_update", userId, status });
    }
  }
}

/** Notify peers and send an initial snapshot to the connecting socket. */
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

  const peerIds = await listPresencePeerIds(ctx, userId);
  const snapshot = await buildPresenceSnapshot(redis, clientsByUser, peerIds);
  send(ws, { type: "presence_snapshot", friends: snapshot });

  if (set.size !== 1) return;

  let status = await loadPresence(redis, userId);
  if (!isConnectedPresence(status)) status = "online";
  await savePresence(redis, userId, status);
  await notifyPeersOfPresence(ctx, redis, userId, clientsByUser, sendToUser);
}

/** Notify peers when the user's last socket disconnects. */
export async function handleUserDisconnected(
  ctx: ApiContext,
  redis: Redis,
  userId: string,
  clientsByUser: ClientsByUser,
  sendToUser: SendToUser
): Promise<void> {
  if (isUserOnline(clientsByUser, userId)) return;

  await savePresence(redis, userId, "offline");

  const peerIds = await listPresencePeerIds(ctx, userId);
  for (const peerId of peerIds) {
    sendToUser(peerId, { type: "presence_update", userId, status: "offline" });
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
  await notifyPeersOfPresence(ctx, redis, userId, clientsByUser, sendToUser);
}
