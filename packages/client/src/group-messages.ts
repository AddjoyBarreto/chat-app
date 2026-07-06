import { parseMessageContent } from "@vaultchat/crypto";
import type { GroupMessageEnvelope, MessageContent } from "@vaultchat/protocol";
import { previewGroupContent } from "./group-admin.js";
import { loadGroupCipher } from "./group-keys.js";
import type { StorageAdapter } from "./storage.js";

export interface DecryptedGroupMessage {
  id: string;
  from: "me" | "them";
  time: string;
  failed?: boolean;
  content: MessageContent;
  text: string;
}

export async function decryptGroupEnvelope(
  storage: StorageAdapter,
  groupId: string,
  envelope: GroupMessageEnvelope,
  userId: string
): Promise<DecryptedGroupMessage> {
  const cipher = await loadGroupCipher(storage, userId, groupId);
  if (!cipher) {
    return {
      id: envelope.id,
      text: "🔒 Missing group key",
      content: { type: "text", text: "🔒 Missing group key" },
      from: envelope.senderId === userId ? "me" : "them",
      time: envelope.createdAt,
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
    };
  } catch {
    return {
      id: envelope.id,
      text: "🔒 Unable to decrypt",
      content: { type: "text", text: "🔒 Unable to decrypt" },
      from: envelope.senderId === userId ? "me" : "them",
      time: envelope.createdAt,
      failed: true,
    };
  }
}
