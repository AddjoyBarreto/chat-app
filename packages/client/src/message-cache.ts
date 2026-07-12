import type { MessageContent } from "@vaultchat/protocol";
import type { StorageAdapter } from "./storage.js";
import { readSealedItem, writeSealedItem } from "./local-vault.js";

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
    const map = await readSealedItem<MessageCacheMap>(
      storage,
      userId,
      messageCacheKey(userId)
    );
    if (!map || typeof map !== "object") return {};
    // SealedBlob mistaken as map: only accept id→message shaped data
    if ("v" in map && "n" in map && "c" in map) return {};
    return map;
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
  await writeSealedItem(storage, userId, messageCacheKey(userId), map);
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
