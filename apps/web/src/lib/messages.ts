import type { MessageContent } from "@vaultchat/protocol";

export type {
  DecryptMessageOptions,
  DisplayMessage,
  MessageStatus,
} from "@vaultchat/client";
export {
  cacheDecryptedMessage,
  decryptEnvelope,
  dedupeMessages,
  encryptOutgoing,
  encryptOutgoingMessage,
  formatMessageDate,
  formatMessageTime,
  groupByDate,
  historyDecryptOptions,
  previewText,
  sortMessages,
} from "@vaultchat/client";

export const MAX_IMAGE_BYTES = 500 * 1024;

export async function readImageFile(file: File): Promise<{ mime: string; data: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be under 500 KB.");
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return { mime: file.type, data: btoa(binary) };
}
