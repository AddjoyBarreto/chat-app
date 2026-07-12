import { clearMessageCache } from "./message-cache.js";
import { clearConversationTimelines } from "./conversation-store.js";
import { clearVaultKey } from "./local-vault.js";
import type { StorageAdapter } from "./storage.js";

/**
 * Wipe all on-device plaintext/sealed message data for a user.
 * Call on logout so decrypted chat history cannot be read after sign-out.
 */
export async function clearLocalChatData(
  storage: StorageAdapter,
  userId: string
): Promise<void> {
  await clearMessageCache(storage, userId);
  await clearConversationTimelines(storage, userId);
  // Drop the vault key last so any leftover sealed blobs become unreadable.
  await clearVaultKey(storage, userId);
}
