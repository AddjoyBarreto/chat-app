import type { VaultDevice } from "@vaultchat/crypto";
import { fetchConversation } from "./api.js";
import { scheduleAccountBackupRefresh } from "./key-backup.js";
import {
  cacheDecryptedMessage,
  isReadableCachedMessage,
  isUnavailableMessage,
} from "./message-cache.js";
import {
  loadConversationTimeline,
  mergeConversationTimeline,
} from "./conversation-store.js";
import {
  decryptEnvelope,
  historyDecryptOptions,
  sortMessages,
  dedupeMessages,
  type DisplayMessage,
} from "./messages.js";
import type { StorageAdapter } from "./storage.js";

export interface SyncConversationOptions {
  storage: StorageAdapter;
  device: VaultDevice;
  token: string;
  userId: string;
  deviceId: number;
  peerId: string;
  limit?: number;
  /**
   * Called as soon as local encrypted cache is loaded (before network).
   * Use this to paint the UI instantly.
   */
  onHydrated?: (messages: DisplayMessage[]) => void | Promise<void>;
  /** Return false to abort applying network results (e.g. user switched chats). */
  isCurrent?: () => boolean;
}

export interface SyncConversationResult {
  messages: DisplayMessage[];
  cursor: string | undefined;
  hasMore: boolean;
  hydratedFromCache: boolean;
}

/**
 * Discord-style open: show local timeline immediately, then fetch latest
 * envelopes and merge. Plaintext never leaves the device — only ciphertext
 * is fetched from the server; decrypted bodies stay in the sealed local vault.
 */
export async function syncConversationWithCache(
  opts: SyncConversationOptions
): Promise<SyncConversationResult> {
  const limit = opts.limit ?? 50;
  const local = await loadConversationTimeline(opts.storage, opts.userId, opts.peerId);
  const hydratedFromCache = local.length > 0;
  const localById = new Map(
    local.filter((m) => isReadableCachedMessage(m)).map((m) => [m.id, m])
  );

  if (hydratedFromCache) {
    await opts.onHydrated?.(local.filter((m) => !isUnavailableMessage(m)));
  }

  const { messages: envelopes, cursor, hasMore } = await fetchConversation(
    opts.token,
    opts.peerId,
    { limit }
  );

  if (opts.isCurrent && !opts.isCurrent()) {
    return {
      messages: local.filter((m) => !isUnavailableMessage(m)),
      cursor: undefined,
      hasMore: false,
      hydratedFromCache,
    };
  }

  const decrypted: DisplayMessage[] = [];
  for (const envelope of envelopes) {
    // Prefer restored / locally-sent plaintext — never re-poison with Signal failures.
    const known = localById.get(envelope.id);
    if (known) {
      decrypted.push(known);
      await cacheDecryptedMessage(opts.storage, opts.userId, known);
      continue;
    }

    const display = await decryptEnvelope(
      opts.device,
      envelope,
      opts.userId,
      historyDecryptOptions(
        opts.storage,
        opts.userId,
        envelope,
        opts.userId,
        opts.deviceId
      )
    );
    decrypted.push(display);
    await cacheDecryptedMessage(opts.storage, opts.userId, display);
  }

  const readable = decrypted.filter((m) => !isUnavailableMessage(m));
  const failedOnly = decrypted.filter((m) => isUnavailableMessage(m));
  const merged = await mergeConversationTimeline(
    opts.storage,
    opts.userId,
    opts.peerId,
    readable
  );

  const byId = new Map(merged.map((m) => [m.id, m]));
  // Show decrypt failures only when we have no readable copy for that id.
  for (const fail of failedOnly) {
    if (!byId.has(fail.id)) byId.set(fail.id, fail);
  }
  const messages = sortMessages(dedupeMessages([...byId.values()]));

  scheduleAccountBackupRefresh(opts.storage, opts.token, opts.device, opts.userId);

  return {
    messages,
    cursor,
    hasMore: Boolean(hasMore),
    hydratedFromCache,
  };
}
