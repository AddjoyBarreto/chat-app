import type { VaultDevice } from "@vaultchat/crypto";
import type { MessageContent } from "@vaultchat/protocol";
import { fetchInbox } from "./api.js";
import { decryptEnvelope } from "./messages.js";
import {
  adoptWorkingGroupKey,
  getStoredGroupKey,
} from "./group-keys.js";
import type { StorageAdapter } from "./storage.js";

/**
 * When community history fails to decrypt, search recent inbox DMs for
 * `group_key` shares and adopt the first key that decrypts a sample message.
 */
export async function recoverGroupKeyFromInbox(options: {
  storage: StorageAdapter;
  token: string;
  userId: string;
  groupId: string;
  device: VaultDevice;
  sampleCiphertext: string;
}): Promise<boolean> {
  const { storage, token, userId, groupId, device, sampleCiphertext } = options;
  const candidates: string[] = [];

  const existing = await getStoredGroupKey(storage, userId, groupId);
  if (existing) candidates.push(existing);

  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const inbox = await fetchInbox(token, { cursor, limit: 50 });
    for (const envelope of inbox.messages) {
      try {
        const display = await decryptEnvelope(device, envelope, userId, {
          storage,
          userId,
          myDeviceId: device.deviceId,
          tryDecrypt: true,
        });
        const content = display.content as MessageContent;
        if (
          content.type === "group_key" &&
          content.groupKey?.groupId === groupId &&
          content.groupKey.key
        ) {
          candidates.push(content.groupKey.key);
        }
      } catch {
        // skip undecryptable DMs
      }
    }
    if (!inbox.hasMore || !inbox.cursor) break;
    cursor = inbox.cursor;
  }

  return adoptWorkingGroupKey(storage, userId, groupId, sampleCiphertext, candidates);
}
