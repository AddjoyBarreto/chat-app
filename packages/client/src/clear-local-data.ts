import { clearMessageCache } from "./message-cache.js";
import { clearConversationTimelines } from "./conversation-store.js";
import { clearVaultKey } from "./local-vault.js";
import { readStateStorageKey } from "./read-state.js";
import type { StorageAdapter } from "./storage.js";

/**
 * Wipe on-device plaintext/sealed cache for one user on logout.
 *
 * Intentionally does **not** clear community/group AES keys (`vaultchat_group_keys_*`).
 * Those are not in account backup; wiping them on logout/session expiry permanently
 * locks the user out of communities (including admins). Keys are already namespaced
 * by `userId`, so another account on this device will not load them.
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
