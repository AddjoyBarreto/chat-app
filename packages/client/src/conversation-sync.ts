import type { VaultDevice } from "@vaultchat/crypto";
import { fetchConversation } from "./api.js";
import { cacheDecryptedMessage } from "./message-cache.js";
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

  if (hydratedFromCache) {
    await opts.onHydrated?.(local);
  }

  const { messages: envelopes, cursor, hasMore } = await fetchConversation(
    opts.token,
    opts.peerId,
    { limit }
  );

  if (opts.isCurrent && !opts.isCurrent()) {
    return {
      messages: local,
      cursor: undefined,
      hasMore: false,
      hydratedFromCache,
    };
  }

  const decrypted: DisplayMessage[] = [];
  for (const envelope of envelopes) {
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

  const merged = await mergeConversationTimeline(
    opts.storage,
    opts.userId,
    opts.peerId,
    decrypted
  );

  // Prefer showing the union when cache had older history; otherwise the sync page.
  const messages = sortMessages(dedupeMessages(merged));

  return {
    messages,
    cursor,
    hasMore: Boolean(hasMore),
    hydratedFromCache,
  };
}
