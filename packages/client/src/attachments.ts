import { arrayBufferToBase64 } from "@vaultchat/crypto";
import type { MessageContent, MessageType } from "@vaultchat/protocol";
import { uploadEncryptedMedia } from "./media.js";
import { MAX_INLINE_IMAGE_BYTES, MAX_MEDIA_BYTES } from "./messages.js";

export { MAX_INLINE_IMAGE_BYTES, MAX_MEDIA_BYTES };

export async function prepareMediaMessage(
  token: string,
  fileBytes: ArrayBuffer,
  mimeType: string
): Promise<{ content: MessageContent; messageType: Extract<MessageType, "image" | "video"> }> {
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
    throw new Error("Only images and videos are supported.");
  }
  if (fileBytes.byteLength > MAX_MEDIA_BYTES) {
    throw new Error("File must be under 50 MB.");
  }

  if (mimeType.startsWith("image/") && fileBytes.byteLength <= MAX_INLINE_IMAGE_BYTES) {
    return {
      messageType: "image",
      content: {
        type: "image",
        image: { mime: mimeType, data: arrayBufferToBase64(fileBytes) },
      },
    };
  }

  const uploaded = await uploadEncryptedMedia(token, fileBytes, mimeType);
  return { content: uploaded.content, messageType: uploaded.messageType };
}
