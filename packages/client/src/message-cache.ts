import type { MessageContent } from "@vaultchat/protocol";
import type { StorageAdapter } from "./storage.js";
import { readSealedItem, writeSealedItem } from "./local-vault.js";

const CACHE_KEY_PREFIX = "vaultchat_msg_cache_";
const MAX_CACHED_MESSAGES = 5000;

/** Known placeholder copy produced when Ciphertext cannot be read. Never treat as real content. */
export const OWN_UNAVAILABLE_TEXT =
  "Sent earlier — not readable after this app was reset. New messages still work.";
/** @deprecated previous copy — still treated as unavailable if present in old caches */
const OWN_UNAVAILABLE_TEXT_LEGACY =
  "Message sent (open on the device that sent it to read)";
export const PEER_UNAVAILABLE_TEXT = "Unable to decrypt this message";

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

export function isUnavailableMessage(message: {
  status?: string;
  content?: { type?: string; text?: string };
}): boolean {
  if (message.status === "decrypt_failed" || message.status === "failed") return true;
  const text = message.content?.text;
  if (!text || message.content?.type !== "text") return false;
  return (
    text === OWN_UNAVAILABLE_TEXT ||
    text === OWN_UNAVAILABLE_TEXT_LEGACY ||
    text === PEER_UNAVAILABLE_TEXT
  );
}

export function isReadableCachedMessage(message: CachedDisplayMessage | null | undefined): boolean {
  return Boolean(message) && !isUnavailableMessage(message!);
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
  const hit = map[messageId] ?? null;
  if (!isReadableCachedMessage(hit)) return null;
  return hit;
}

export async function cacheDecryptedMessage(
  storage: StorageAdapter,
  userId: string,
  message: CachedDisplayMessage
): Promise<void> {
  // Never persist placeholders / failures — they would poison restored history.
  if (!isReadableCachedMessage(message)) return;
  const map = await loadCache(storage, userId);
  map[message.id] = message;
  await saveCache(storage, userId, map);
}

/** Full message-cache map for account backup (successful reads only). */
export async function exportMessageCache(
  storage: StorageAdapter,
  userId: string
): Promise<MessageCacheMap> {
  const map = await loadCache(storage, userId);
  const cleaned: MessageCacheMap = {};
  for (const [id, msg] of Object.entries(map)) {
    if (isReadableCachedMessage(msg)) cleaned[id] = msg;
  }
  return cleaned;
}

/** Merge restored messages into local cache (does not delete existing readable entries). */
export async function importMessageCache(
  storage: StorageAdapter,
  userId: string,
  map: MessageCacheMap
): Promise<number> {
  const existing = await loadCache(storage, userId);
  let added = 0;
  for (const [id, msg] of Object.entries(map)) {
    if (!isReadableCachedMessage(msg)) continue;
    if (!isReadableCachedMessage(existing[id])) {
      existing[id] = msg;
      added++;
    }
  }
  await saveCache(storage, userId, existing);
  return added;
}

export async function clearMessageCache(storage: StorageAdapter, userId: string): Promise<void> {
  await storage.removeItem(messageCacheKey(userId));
}
