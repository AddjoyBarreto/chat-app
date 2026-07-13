import { clearMessageCache } from "./message-cache.js";
import { clearConversationTimelines } from "./conversation-store.js";
import { clearGroupKeys } from "./group-keys.js";
import { clearVaultKey } from "./local-vault.js";
import { readStateStorageKey } from "./read-state.js";
import type { StorageAdapter } from "./storage.js";

/**
 * Wipe all on-device plaintext/sealed data for one user.
 * Call on logout so the next account on this device cannot read the prior user's cache.
 *
 * Storage keys are namespaced by `userId` (timelines, message cache, device keys,
 * vault key, group keys, read state). Only the active session pointer is global.
 */
export async function clearLocalChatData(
  storage: StorageAdapter,
  userId: string
): Promise<void> {
  await clearMessageCache(storage, userId);
  await clearConversationTimelines(storage, userId);
  await clearGroupKeys(storage, userId);
  await storage.removeItem(readStateStorageKey(userId));
  // Drop the vault key last so any leftover sealed blobs become unreadable.
  await clearVaultKey(storage, userId);
}
