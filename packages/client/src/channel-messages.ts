import { parseMessageContent, serializeMessageContent, type VaultDevice } from "@vaultchat/crypto";
import type {
  ChannelMessageEnvelope,
  MessageContent,
  MessageType,
  PaginationOptions,
} from "@vaultchat/protocol";
import { fetchChannelMessages, sendChannelMessage } from "./channels.js";
import { fetchGroupMessages } from "./groups.js";
import { previewGroupContent } from "./group-admin.js";
import {
  decryptGroupEnvelope,
  type DecryptedGroupMessage,
} from "./group-messages.js";
import { loadGroupCipher } from "./group-keys.js";
import { validateMessageContent } from "./messages.js";
import type { StorageAdapter } from "./storage.js";

export async function decryptChannelEnvelope(
  storage: StorageAdapter,
  communityId: string,
  envelope: ChannelMessageEnvelope,
  userId: string
): Promise<DecryptedGroupMessage> {
  const cipher = await loadGroupCipher(storage, userId, communityId);
  if (!cipher) {
    return {
      id: envelope.id,
      text: "🔒 Missing group key",
      content: { type: "text", text: "🔒 Missing group key" },
      from: envelope.senderId === userId ? "me" : "them",
      time: envelope.createdAt,
      senderId: envelope.senderId,
      failed: true,
    };
  }

  try {
    const plaintext = await cipher.decrypt(envelope.ciphertext);
    const content = parseMessageContent(plaintext);
    return {
      id: envelope.id,
      text: previewGroupContent(content),
      content,
      from: envelope.senderId === userId ? "me" : "them",
      time: envelope.createdAt,
      senderId: envelope.senderId,
    };
  } catch {
    return {
      id: envelope.id,
      text: "🔒 Unable to decrypt",
      content: { type: "text", text: "🔒 Unable to decrypt" },
      from: envelope.senderId === userId ? "me" : "them",
      time: envelope.createdAt,
      senderId: envelope.senderId,
      failed: true,
    };
  }
}

export async function sendChannelContentMessage(
  storage: StorageAdapter,
  userId: string,
  token: string,
  communityId: string,
  channelId: string,
  content: MessageContent,
  messageType: MessageType
): Promise<{ messageId: string; createdAt: string }> {
  if (messageType === "text") {
    const textError = validateMessageContent(content);
    if (textError) throw new Error(textError);
  }
  const cipher = await loadGroupCipher(storage, userId, communityId);
  if (!cipher) throw new Error("Group encryption key not found");
  const payload = await cipher.encrypt(serializeMessageContent(content));
  return sendChannelMessage(token, channelId, { ciphertext: payload, messageType });
}

export interface ChannelHistoryPage {
  messages: DecryptedGroupMessage[];
  cursor?: string;
  hasMore: boolean;
  /** True when results came from legacy group_messages (pre-channel storage). */
  legacy?: boolean;
}

export type LoadChannelHistoryOptions = PaginationOptions & {
  allowLegacyFallback?: boolean;
  legacy?: boolean;
  /** When all messages fail decrypt, try restoring the AES key from key-share DMs. */
  device?: VaultDevice;
};

/**
 * Load a page of channel messages. When the channel has no history yet,
 * falls back once to community-wide group messages so older chats remain visible.
 * Pass `legacy: true` on subsequent pages when the first page used the fallback.
 * On the first page (no cursor), merges any channel messages with legacy group
 * history so existing communities keep their older messages after channel send.
 */
export async function loadChannelHistory(
  storage: StorageAdapter,
  token: string,
  communityId: string,
  channelId: string,
  userId: string,
  opts?: LoadChannelHistoryOptions
): Promise<ChannelHistoryPage> {
  if (opts?.legacy) {
    const legacy = await fetchGroupMessages(token, communityId, {
      cursor: opts.cursor,
      limit: opts.limit ?? 50,
    });
    const messages: DecryptedGroupMessage[] = [];
    for (const envelope of legacy.messages) {
      messages.push(await decryptGroupEnvelope(storage, communityId, envelope, userId));
    }
    return {
      messages,
      cursor: legacy.cursor,
      hasMore: Boolean(legacy.hasMore),
      legacy: true,
    };
  }

  const limit = opts?.limit ?? 50;
  const { messages: envelopes, cursor, hasMore } = await fetchChannelMessages(token, channelId, {
    cursor: opts?.cursor,
    limit,
  });

  const messages: DecryptedGroupMessage[] = [];
  for (const envelope of envelopes) {
    messages.push(await decryptChannelEnvelope(storage, communityId, envelope, userId));
  }

  // Paginated channel history — no legacy merge.
  if (opts?.cursor || opts?.allowLegacyFallback === false) {
    return { messages, cursor, hasMore: Boolean(hasMore) };
  }

  // First page: merge legacy group messages so pre-channel history stays visible.
  const legacy = await fetchGroupMessages(token, communityId, { limit });
  const seen = new Set(messages.map((m) => m.id));
  let addedLegacy = 0;
  for (const envelope of legacy.messages) {
    if (seen.has(envelope.id)) continue;
    messages.push(await decryptGroupEnvelope(storage, communityId, envelope, userId));
    seen.add(envelope.id);
    addedLegacy++;
  }
  messages.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const usedLegacyOnly = envelopes.length === 0 && addedLegacy > 0;

  // If everything failed to decrypt, try recovering the AES key from key-share DMs.
  if (messages.length > 0 && messages.every((m) => m.failed) && opts?.device) {
    const sample =
      legacy.messages[legacy.messages.length - 1]?.ciphertext ??
      envelopes[envelopes.length - 1]?.ciphertext;
    if (sample) {
      const { recoverGroupKeyFromInbox } = await import("./group-key-recovery.js");
      const recovered = await recoverGroupKeyFromInbox({
        storage,
        token,
        userId,
        groupId: communityId,
        device: opts.device,
        sampleCiphertext: sample,
      });
      if (recovered) {
        const retried: DecryptedGroupMessage[] = [];
        for (const envelope of envelopes) {
          retried.push(await decryptChannelEnvelope(storage, communityId, envelope, userId));
        }
        for (const envelope of legacy.messages) {
          if (retried.some((m) => m.id === envelope.id)) continue;
          retried.push(await decryptGroupEnvelope(storage, communityId, envelope, userId));
        }
        retried.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        return {
          messages: retried,
          cursor: usedLegacyOnly ? legacy.cursor : cursor,
          hasMore: usedLegacyOnly
            ? Boolean(legacy.hasMore)
            : Boolean(hasMore) || Boolean(legacy.hasMore),
          legacy: usedLegacyOnly,
        };
      }
    }
  }

  return {
    messages,
    cursor: usedLegacyOnly ? legacy.cursor : cursor,
    hasMore: usedLegacyOnly
      ? Boolean(legacy.hasMore)
      : Boolean(hasMore) || Boolean(legacy.hasMore),
    legacy: usedLegacyOnly,
  };
}
