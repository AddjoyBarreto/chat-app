import { clearMessageCache } from "./message-cache.js";
import { clearConversationTimelines } from "./conversation-store.js";
import { clearVaultKey } from "./local-vault.js";
import { readStateStorageKey } from "./read-state.js";
import type { StorageAdapter } from "./storage.js";

/**
 * Wipe on-device plaintext/sealed cache for one user on logout.
 *
 * Intentionally does **not** clear community/group AES keys (`vaultchat_group_keys_*`).
 * Those are included in account backup v2, but wiping them on logout/session expiry when
 * backup upload failed would permanently lock the user out of communities. Keys are already
 * namespaced by `userId`, so another account on this device will not load them.
 */
export async function clearLocalChatData(
  storage: StorageAdapter,
  userId: string
): Promise<void> {
  await clearMessageCache(storage, userId);
  await clearConversationTimelines(storage, userId);
  await storage.removeItem(readStateStorageKey(userId));
  // Drop the vault key last so any leftover sealed blobs become unreadable.
  await clearVaultKey(storage, userId);
}
