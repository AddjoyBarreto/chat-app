import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  decryptAttachment,
  encryptAttachment,
  serializeMessageContent,
} from "@vaultchat/crypto";
import type { MessageContent } from "@vaultchat/protocol";
import { requestMediaDownloadUrl, requestMediaUploadUrl } from "./api.js";
import { getClientConfig } from "./config.js";

/** Presigned R2 URLs must not get extra headers; local API routes need JWT. */
function authHeadersForMediaUrl(token: string, url: string): Record<string, string> {
  try {
    const base = getClientConfig().apiBaseUrl;
    const target = new URL(url, base);
    const api = new URL(base);
    if (target.origin === api.origin && target.pathname.includes("/api/v1/media/")) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    if (url.includes("/api/v1/media/")) {
      return { Authorization: `Bearer ${token}` };
    }
  }
  return {};
}

export async function uploadEncryptedMedia(
  token: string,
  fileBytes: ArrayBuffer,
  mimeType: string
): Promise<{ content: MessageContent; messageType: "image" | "video" }> {
  const encrypted = await encryptAttachment(fileBytes);
  const ciphertextBytes = new Uint8Array(base64ToArrayBuffer(encrypted.ciphertext));

  const { mediaId, uploadUrl } = await requestMediaUploadUrl(
    token,
    mimeType,
    ciphertextBytes.byteLength
  );

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      ...authHeadersForMediaUrl(token, uploadUrl),
    },
    body: ciphertextBytes,
  });
  if (!uploadRes.ok) throw new Error("Media upload failed");

  const messageType = mimeType.startsWith("video/") ? "video" : "image";
  return {
    messageType,
    content: {
      type: "media",
      media: {
        mediaId,
        mime: mimeType,
        key: encrypted.key,
        nonce: encrypted.nonce,
        sizeBytes: ciphertextBytes.byteLength,
      },
    },
  };
}

export async function downloadEncryptedMedia(
  token: string,
  media: NonNullable<MessageContent["media"]>
): Promise<ArrayBuffer> {
  const { downloadUrl } = await requestMediaDownloadUrl(token, media.mediaId);
  const res = await fetch(downloadUrl, {
    headers: authHeadersForMediaUrl(token, downloadUrl),
  });
  if (!res.ok) throw new Error("Media download failed");
  const ciphertext = await res.arrayBuffer();
  return decryptAttachment({
    ciphertext: arrayBufferToBase64(ciphertext),
    nonce: media.nonce,
    key: media.key,
  });
}

export function contentToPlaintext(content: MessageContent): string {
  return serializeMessageContent(content);
}
