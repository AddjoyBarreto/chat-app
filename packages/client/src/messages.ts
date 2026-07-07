import {
  parseMessageContent,
  serializeMessageContent,
  type VaultDevice,
} from "@vaultchat/crypto";
import type { MessageContent, MessageEnvelope, PreKeyBundleResponse } from "@vaultchat/protocol";
import { parseEnvelopeCiphertext } from "./api.js";
import {
  cacheDecryptedMessage,
  getCachedMessage,
} from "./message-cache.js";
import { validateMessageText } from "./message-text.js";
import type { StorageAdapter } from "./storage.js";

export type MessageStatus = "sent" | "delivered" | "failed" | "decrypt_failed";

export interface DecryptMessageOptions {
  storage: StorageAdapter;
  userId: string;
  myDeviceId?: number;
  /**
   * When false, only read from the local plaintext cache (for history reload).
   * Signal PreKey messages cannot be decrypted twice from server ciphertext.
   */
  tryDecrypt?: boolean;
}

export interface DisplayMessage {
  id: string;
  from: "me" | "them";
  content: MessageContent;
  time: string;
  date: string;
  status: MessageStatus;
}

export function dedupeMessages(messages: DisplayMessage[]): DisplayMessage[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export function sortMessages(messages: DisplayMessage[]): DisplayMessage[] {
  return [...messages].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );
}

export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatMessageDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function previewText(msg: DisplayMessage): string {
  if (msg.status === "decrypt_failed") return "Unable to decrypt";
  if (msg.content.type === "image") return "📷 Photo";
  if (msg.content.type === "video") return "🎬 Video";
  if (msg.content.type === "media") {
    return msg.content.media?.mime.startsWith("video/") ? "🎬 Video" : "📷 Photo";
  }
  return msg.content.text ?? "";
}

function pickRecipientCiphertext(
  envelope: MessageEnvelope,
  myDeviceId?: number
): string {
  if (myDeviceId !== undefined) {
    const perDevice = envelope.recipientCiphertexts?.[String(myDeviceId)];
    if (perDevice) return perDevice;
  }
  return envelope.ciphertext;
}

export async function decryptEnvelope(
  device: VaultDevice,
  envelope: MessageEnvelope,
  myUserId: string,
  options?: DecryptMessageOptions
): Promise<DisplayMessage> {
  const from: "me" | "them" = envelope.senderId === myUserId ? "me" : "them";
  const tryDecrypt = options?.tryDecrypt !== false;

  if (options) {
    const cached = await getCachedMessage(options.storage, options.userId, envelope.id);
    if (cached) return cached;
  }

  const undecryptable = (): DisplayMessage => ({
    id: envelope.id,
    from,
    content: {
      type: "text",
      text:
        from === "me"
          ? "Message sent (open on the device that sent it to read)"
          : "Unable to decrypt this message",
    },
    time: envelope.createdAt,
    date: formatMessageDate(envelope.createdAt),
    status: from === "me" ? "sent" : "decrypt_failed",
  });

  // Own messages: decrypt sender copy for this device, or fall back to cache.
  if (envelope.senderId === myUserId) {
    const myDeviceId = options?.myDeviceId;
    const copies = envelope.senderCiphertexts;

    if (copies && tryDecrypt) {
      const preferredKey =
        myDeviceId !== undefined ? String(myDeviceId) : undefined;
      const keysToTry = [
        ...(preferredKey && copies[preferredKey] ? [preferredKey] : []),
        ...Object.keys(copies).filter((k) => k !== preferredKey),
      ];

      for (const key of keysToTry) {
        const copyRaw = copies[key];
        if (!copyRaw) continue;
        try {
          const payload = parseEnvelopeCiphertext(copyRaw);
          const plaintext = await device.decrypt(
            myUserId,
            envelope.senderDeviceId,
            payload
          );
          const content = parseMessageContent(plaintext);
          const display: DisplayMessage = {
            id: envelope.id,
            from: "me",
            content,
            time: envelope.createdAt,
            date: formatMessageDate(envelope.createdAt),
            status: "sent",
          };
          if (options) {
            await cacheDecryptedMessage(options.storage, options.userId, display);
          }
          return display;
        } catch {
          // try next sender copy
        }
      }
    }
    return undecryptable();
  }

  if (!tryDecrypt) {
    return undecryptable();
  }

  try {
    const ciphertextCandidates: string[] = [];
    const preferred = pickRecipientCiphertext(envelope, options?.myDeviceId);
    ciphertextCandidates.push(preferred);
    if (envelope.recipientCiphertexts) {
      for (const raw of Object.values(envelope.recipientCiphertexts)) {
        if (raw !== preferred) ciphertextCandidates.push(raw);
      }
    }

    for (const raw of ciphertextCandidates) {
      try {
        const payload = parseEnvelopeCiphertext(raw);
        const plaintext = await device.decrypt(
          envelope.senderId,
          envelope.senderDeviceId,
          payload
        );
        const content = parseMessageContent(plaintext);

        const display: DisplayMessage = {
          id: envelope.id,
          from,
          content,
          time: envelope.createdAt,
          date: formatMessageDate(envelope.createdAt),
          status: "delivered",
        };

        if (options) {
          await cacheDecryptedMessage(options.storage, options.userId, display);
        }

        return display;
      } catch {
        // try next ciphertext variant
      }
    }

    return undecryptable();
  } catch {
    return undecryptable();
  }
}

export function historyDecryptOptions(
  storage: StorageAdapter,
  userId: string,
  envelope: MessageEnvelope,
  myUserId: string,
  myDeviceId: number
): DecryptMessageOptions {
  return {
    storage,
    userId,
    myDeviceId,
    tryDecrypt: true,
  };
}

export interface OutgoingEncryptedMessage {
  recipientPayload: import("@vaultchat/crypto").EncryptedPayload;
  recipientCiphertexts: Record<string, string>;
  senderCiphertexts: Record<string, string>;
}

/** Encrypt for every recipient device plus per-device copies for sender's other sessions. */
export function validateMessageContent(content: MessageContent): string | null {
  if (content.type === "text" && content.text != null) {
    return validateMessageText(content.text);
  }
  return null;
}

export async function encryptOutgoingMessage(
  device: VaultDevice,
  senderUserId: string,
  recipientId: string,
  content: MessageContent,
  recipientBundles: Array<{ deviceId: number; bundle: PreKeyBundleResponse }>,
  ownDeviceBundles: Array<{ deviceId: number; bundle: PreKeyBundleResponse }>
): Promise<OutgoingEncryptedMessage> {
  const textError = validateMessageContent(content);
  if (textError) throw new Error(textError);
  const plaintext = serializeMessageContent(content);
  const recipientCiphertexts: Record<string, string> = {};
  let recipientPayload: import("@vaultchat/crypto").EncryptedPayload | undefined;

  for (const { deviceId, bundle } of recipientBundles) {
    const payload = await device.encrypt(recipientId, deviceId, plaintext, bundle);
    recipientCiphertexts[String(deviceId)] = JSON.stringify(payload);
    if (!recipientPayload || deviceId === 1) {
      recipientPayload = payload;
    }
  }

  if (!recipientPayload) {
    throw new Error("Recipient has no registered devices");
  }

  const senderCiphertexts: Record<string, string> = {};

  for (const { deviceId, bundle } of ownDeviceBundles) {
    const payload = await device.encrypt(senderUserId, deviceId, plaintext, bundle);
    senderCiphertexts[String(deviceId)] = JSON.stringify(payload);
  }

  return { recipientPayload, recipientCiphertexts, senderCiphertexts };
}

export async function encryptOutgoing(
  device: VaultDevice,
  recipientId: string,
  content: MessageContent,
  bundle?: PreKeyBundleResponse
) {
  const plaintext = serializeMessageContent(content);
  const recipientDeviceId = bundle?.deviceId ?? 1;
  return device.encrypt(recipientId, recipientDeviceId, plaintext, bundle);
}

export function groupByDate(
  messages: DisplayMessage[]
): { date: string; messages: DisplayMessage[] }[] {
  const groups: { date: string; messages: DisplayMessage[] }[] = [];
  let current: { date: string; messages: DisplayMessage[] } | null = null;

  for (const msg of messages) {
    if (!current || current.date !== msg.date) {
      current = { date: msg.date, messages: [] };
      groups.push(current);
    }
    current.messages.push(msg);
  }

  return groups;
}

export const MAX_INLINE_IMAGE_BYTES = 500 * 1024;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
