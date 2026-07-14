import type { StorageAdapter } from "./storage.js";
import type { CachedDisplayMessage } from "./message-cache.js";
import {
  cacheDecryptedMessage,
  isReadableCachedMessage,
  isUnavailableMessage,
} from "./message-cache.js";
import { readSealedItem, writeSealedItem } from "./local-vault.js";
import {
  dedupeMessages,
  formatMessageDate,
  sortMessages,
  type DisplayMessage,
} from "./messages.js";

const TIMELINE_KEY_PREFIX = "vaultchat_timeline_";
const TIMELINE_INDEX_PREFIX = "vaultchat_timeline_peers_";
const LEGACY_TIMELINES_KEY_PREFIX = "vaultchat_timelines_";
const MAX_MESSAGES_PER_PEER = 300;
const MAX_CACHED_PEERS = 40;

export function timelineStorageKey(userId: string, peerId: string): string {
  return `${TIMELINE_KEY_PREFIX}${userId}_${peerId}`;
}

function timelinePeerIndexKey(userId: string): string {
  return `${TIMELINE_INDEX_PREFIX}${userId}`;
}

function legacyTimelinesKey(userId: string): string {
  return `${LEGACY_TIMELINES_KEY_PREFIX}${userId}`;
}

export interface ConversationTimeline {
  peerId: string;
  messages: CachedDisplayMessage[];
  /** ISO timestamp of newest cached message — used as sync watermark. */
  newestAt?: string;
  updatedAt: string;
}

async function loadPeerIndex(storage: StorageAdapter, userId: string): Promise<string[]> {
  const index = await readSealedItem<string[]>(storage, userId, timelinePeerIndexKey(userId));
  return Array.isArray(index) ? index : [];
}

async function savePeerIndex(
  storage: StorageAdapter,
  userId: string,
  peers: string[]
): Promise<void> {
  const unique = [...new Set(peers)];
  let trimmed = unique;
  if (trimmed.length > MAX_CACHED_PEERS) {
    // Drop oldest peer timelines beyond the cap.
    const ranked: { peerId: string; updatedAt: string }[] = [];
    for (const peerId of trimmed) {
      const entry = await readSealedItem<ConversationTimeline>(
        storage,
        userId,
        timelineStorageKey(userId, peerId)
      );
      ranked.push({ peerId, updatedAt: entry?.updatedAt ?? "" });
    }
    ranked.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const drop = ranked.slice(0, ranked.length - MAX_CACHED_PEERS);
    for (const { peerId } of drop) {
      await storage.removeItem(timelineStorageKey(userId, peerId));
    }
    trimmed = ranked.slice(-MAX_CACHED_PEERS).map((r) => r.peerId);
  }
  await writeSealedItem(storage, userId, timelinePeerIndexKey(userId), trimmed);
}

function toCached(messages: DisplayMessage[]): CachedDisplayMessage[] {
  return messages.map((m) => ({
    id: m.id,
    from: m.from,
    content: m.content,
    time: m.time,
    date: m.date,
    status: m.status,
  }));
}

function capMessages(messages: CachedDisplayMessage[]): CachedDisplayMessage[] {
  if (messages.length <= MAX_MESSAGES_PER_PEER) return messages;
  return messages.slice(-MAX_MESSAGES_PER_PEER);
}

async function migrateLegacyIfNeeded(
  storage: StorageAdapter,
  userId: string,
  peerId: string
): Promise<ConversationTimeline | null> {
  const legacy = await readSealedItem<Record<string, ConversationTimeline>>(
    storage,
    userId,
    legacyTimelinesKey(userId)
  );
  if (!legacy || typeof legacy !== "object") return null;
  const entry = legacy[peerId];
  if (!entry?.messages?.length) return null;

  await writeSealedItem(storage, userId, timelineStorageKey(userId, peerId), entry);
  const peers = Object.keys(legacy);
  await savePeerIndex(storage, userId, peers);
  // Best-effort: leave legacy blob until logout clears it; avoid rewriting whole map here.
  return entry;
}

export async function loadConversationTimeline(
  storage: StorageAdapter,
  userId: string,
  peerId: string
): Promise<DisplayMessage[]> {
  let entry = await readSealedItem<ConversationTimeline>(
    storage,
    userId,
    timelineStorageKey(userId, peerId)
  );
  if (!entry?.messages?.length) {
    entry = await migrateLegacyIfNeeded(storage, userId, peerId);
  }
  if (!entry?.messages?.length) return [];
  return sortMessages(entry.messages as DisplayMessage[])
    .filter((m) => !isUnavailableMessage(m))
    .map((m) => ({
      ...m,
      date: formatMessageDate(m.time),
    }));
}

export async function saveConversationTimeline(
  storage: StorageAdapter,
  userId: string,
  peerId: string,
  messages: DisplayMessage[]
): Promise<void> {
  const sorted = capMessages(
    toCached(sortMessages(dedupeMessages(messages.filter((m) => !isUnavailableMessage(m)))))
  );
  const newestAt = sorted[sorted.length - 1]?.time;
  const entry: ConversationTimeline = {
    peerId,
    messages: sorted,
    newestAt,
    updatedAt: new Date().toISOString(),
  };
  await writeSealedItem(storage, userId, timelineStorageKey(userId, peerId), entry);

  const peers = await loadPeerIndex(storage, userId);
  if (!peers.includes(peerId)) {
    peers.push(peerId);
    await savePeerIndex(storage, userId, peers);
  }
}

/** Merge messages into the local timeline (e.g. after send / realtime / sync). */
export async function mergeConversationTimeline(
  storage: StorageAdapter,
  userId: string,
  peerId: string,
  incoming: DisplayMessage[]
): Promise<DisplayMessage[]> {
  const readableIncoming = incoming.filter((m) => !isUnavailableMessage(m));
  if (readableIncoming.length === 0) {
    return loadConversationTimeline(storage, userId, peerId);
  }
  const existing = await loadConversationTimeline(storage, userId, peerId);
  // Prefer existing readable copies when ids collide (restored history wins over empty retries).
  const merged = sortMessages(dedupeMessages([...existing, ...readableIncoming]));
  await saveConversationTimeline(storage, userId, peerId, merged);
  return merged;
}

/** Drop a timeline entry (e.g. optimistic client UUID after server ack). */
export async function removeTimelineMessage(
  storage: StorageAdapter,
  userId: string,
  peerId: string,
  messageId: string
): Promise<void> {
  const existing = await loadConversationTimeline(storage, userId, peerId);
  const next = existing.filter((m) => m.id !== messageId);
  if (next.length === existing.length) return;
  await saveConversationTimeline(storage, userId, peerId, next);
}

/**
 * Seal the sender's own plaintext after a successful send.
 * Own-device Signal copies are not written for the sending device — this local
 * cache (and the password backup) is the only way history survives a rebuild.
 */
export async function persistOwnDirectMessage(
  storage: StorageAdapter,
  userId: string,
  peerId: string,
  message: DisplayMessage,
  opts?: { replaceOptimisticId?: string }
): Promise<void> {
  if (isUnavailableMessage(message)) return;
  if (opts?.replaceOptimisticId) {
    await removeTimelineMessage(storage, userId, peerId, opts.replaceOptimisticId);
  }
  await cacheDecryptedMessage(storage, userId, message);
  await mergeConversationTimeline(storage, userId, peerId, [message]);
}

export async function clearConversationTimelines(
  storage: StorageAdapter,
  userId: string
): Promise<void> {
  const peers = await loadPeerIndex(storage, userId);
  await Promise.all(
    peers.map((peerId) => storage.removeItem(timelineStorageKey(userId, peerId)))
  );
  await storage.removeItem(timelinePeerIndexKey(userId));
  await storage.removeItem(legacyTimelinesKey(userId));
}

/** Dump peer timelines for password backup. */
export async function exportConversationTimelines(
  storage: StorageAdapter,
  userId: string
): Promise<Record<string, ConversationTimeline>> {
  const peers = await loadPeerIndex(storage, userId);
  const out: Record<string, ConversationTimeline> = {};
  for (const peerId of peers) {
    const entry = await readSealedItem<ConversationTimeline>(
      storage,
      userId,
      timelineStorageKey(userId, peerId)
    );
    if (!entry?.messages?.length) continue;
    out[peerId] = {
      ...entry,
      messages: entry.messages.filter((m) => isReadableCachedMessage(m)),
    };
  }
  return out;
}

/** Restore peer timelines from password backup (merges with any local readable messages). */
export async function importConversationTimelines(
  storage: StorageAdapter,
  userId: string,
  timelines: Record<string, ConversationTimeline>
): Promise<number> {
  let restored = 0;
  for (const [peerId, entry] of Object.entries(timelines)) {
    if (!entry?.messages?.length) continue;
    const messages = (entry.messages as DisplayMessage[]).filter(
      (m) => isReadableCachedMessage(m)
    );
    if (messages.length === 0) continue;
    await mergeConversationTimeline(storage, userId, peerId, messages);
    restored += messages.length;
  }
  return restored;
}
