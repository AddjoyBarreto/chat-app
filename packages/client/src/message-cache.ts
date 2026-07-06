import type { MessageContent } from "@vaultchat/protocol";
import type { StorageAdapter } from "./storage.js";

const CACHE_KEY_PREFIX = "vaultchat_msg_cache_";
const MAX_CACHED_MESSAGES = 5000;

export interface CachedDisplayMessage {
  id: string;
  from: "me" | "them";
  content: MessageContent;
  time: string;
  date: string;
  status: "sent" | "delivered" | "failed" | "decrypt_failed";
}

export function messageCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

type MessageCacheMap = Record<string, CachedDisplayMessage>;

async function loadCache(storage: StorageAdapter, userId: string): Promise<MessageCacheMap> {
  try {
    const raw = await storage.getItem(messageCacheKey(userId));
    if (!raw) return {};
    return JSON.parse(raw) as MessageCacheMap;
  } catch {
    return {};
  }
}

async function saveCache(
  storage: StorageAdapter,
  userId: string,
  map: MessageCacheMap
): Promise<void> {
  const entries = Object.entries(map);
  if (entries.length > MAX_CACHED_MESSAGES) {
    entries.sort(
      (a, b) => new Date(a[1].time).getTime() - new Date(b[1].time).getTime()
    );
    const keep = entries.slice(-MAX_CACHED_MESSAGES);
    map = Object.fromEntries(keep);
  }
  await storage.setItem(messageCacheKey(userId), JSON.stringify(map));
}

export async function getCachedMessage(
  storage: StorageAdapter,
  userId: string,
  messageId: string
): Promise<CachedDisplayMessage | null> {
  const map = await loadCache(storage, userId);
  return map[messageId] ?? null;
}

export async function cacheDecryptedMessage(
  storage: StorageAdapter,
  userId: string,
  message: CachedDisplayMessage
): Promise<void> {
  const map = await loadCache(storage, userId);
  map[message.id] = message;
  await saveCache(storage, userId, map);
}

export async function clearMessageCache(storage: StorageAdapter, userId: string): Promise<void> {
  await storage.removeItem(messageCacheKey(userId));
}
