import {
  parseMessageContent,
  serializeMessageContent,
  type VaultDevice,
} from "@vaultchat/crypto";
import type { MessageContent, MessageEnvelope, PreKeyBundleResponse } from "@vaultchat/protocol";
import { fetchPreKeyBundle, parseEnvelopeCiphertext } from "./api.js";
import {
  cacheDecryptedMessage,
  getCachedMessage,
  isUnavailableMessage,
  OWN_UNAVAILABLE_TEXT,
  PEER_UNAVAILABLE_TEXT,
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
   * Signal message keys are one-shot — ciphertext from the server cannot be
   * decrypted twice after a successful decrypt has already advanced the ratchet.
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
  if (isUnavailableMessage(msg) || msg.status === "decrypt_failed") return "Unable to decrypt";
  if (msg.content.type === "image") return "📷 Photo";
  if (msg.content.type === "video") return "🎬 Video";
  if (msg.content.type === "media") {
    return msg.content.media?.mime.startsWith("video/") ? "🎬 Video" : "📷 Photo";
  }
  return msg.content.text ?? "";
}

/** Ciphertext for this device only — never try other devices' copies (poisons ratchets). */
function pickRecipientCiphertext(
  envelope: MessageEnvelope,
  myDeviceId?: number
): string | null {
  if (myDeviceId !== undefined) {
    const perDevice = envelope.recipientCiphertexts?.[String(myDeviceId)];
    if (perDevice) return perDevice;
  }
  // Legacy single-ciphertext messages (pre multi-device fan-out).
  if (envelope.ciphertext) return envelope.ciphertext;
  return null;
}

function pickSenderCiphertext(
  envelope: MessageEnvelope,
  myDeviceId?: number
): string | null {
  const copies = envelope.senderCiphertexts;
  if (!copies) return null;
  if (myDeviceId !== undefined) {
    return copies[String(myDeviceId)] ?? null;
  }
  const values = Object.values(copies);
  return values.length === 1 ? values[0]! : null;
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
      text: from === "me" ? OWN_UNAVAILABLE_TEXT : PEER_UNAVAILABLE_TEXT,
    },
    time: envelope.createdAt,
    date: formatMessageDate(envelope.createdAt),
    // Always decrypt_failed so callers never treat placeholders as real "sent" content.
    status: "decrypt_failed",
  });

  // Own messages: decrypt sender copy for this device, or fall back to self-DM recipient copy.
  if (envelope.senderId === myUserId) {
    if (tryDecrypt) {
      const senderCopy = pickSenderCiphertext(envelope, options?.myDeviceId);
      if (senderCopy) {
        try {
          const payload = parseEnvelopeCiphertext(senderCopy);
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
          // fall through
        }
      }

      if (envelope.recipientId === myUserId) {
        const recipientCopy = pickRecipientCiphertext(envelope, options?.myDeviceId);
        if (recipientCopy) {
          try {
            const payload = parseEnvelopeCiphertext(recipientCopy);
            const plaintext = await device.decrypt(
              envelope.senderId,
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
            // fall through
          }
        }
      }
    }

    return undecryptable();
  }

  if (!tryDecrypt) {
    return undecryptable();
  }

  try {
    const raw = pickRecipientCiphertext(envelope, options?.myDeviceId);
    if (!raw) return undecryptable();

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
    return undecryptable();
  }
}

export function historyDecryptOptions(
  storage: StorageAdapter,
  userId: string,
  _envelope: MessageEnvelope,
  _myUserId: string,
  myDeviceId: number
): DecryptMessageOptions {
  return {
    storage,
    userId,
    myDeviceId,
    // Cache is checked first; only uncached envelopes attempt Signal decrypt once.
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
  if (content.type === "text") {
    return validateMessageText(content.text ?? "");
  }
  return null;
}

async function encryptForDevice(
  device: VaultDevice,
  peerUserId: string,
  peerDeviceId: number,
  plaintext: string,
  fetchBundle: (userId: string, deviceId: number) => Promise<PreKeyBundleResponse>
): Promise<import("@vaultchat/crypto").EncryptedPayload> {
  const id = Number(peerDeviceId);
  if (!Number.isFinite(id) || id < 1) {
    throw new Error(`Invalid peer device id: ${String(peerDeviceId)}`);
  }
  const hasSession = await device.hasOpenSession(peerUserId, id);
  const bundle = hasSession ? undefined : await fetchBundle(peerUserId, id);
  return device.encrypt(peerUserId, id, plaintext, bundle);
}

/** Accept plain ids or legacy `{ deviceId }` / `{ deviceId, bundle }` entries. */
function normalizeDeviceIdList(
  ids: Array<number | string | { deviceId: number }>
): number[] {
  const out: number[] = [];
  for (const entry of ids) {
    const raw =
      typeof entry === "object" && entry !== null
        ? (entry as { deviceId: number }).deviceId
        : entry;
    const id = Number(raw);
    if (!Number.isFinite(id) || id < 1) {
      throw new Error(`Invalid device id in fan-out list: ${String(entry)}`);
    }
    out.push(id);
  }
  return out;
}

/**
 * Encrypt for recipient devices + other own devices.
 * Only fetches/consumes one-time prekeys when no Signal session exists yet.
 */
export async function encryptOutgoingMessage(
  device: VaultDevice,
  senderUserId: string,
  recipientId: string,
  content: MessageContent,
  recipientDeviceIds: Array<number | string | { deviceId: number }>,
  ownOtherDeviceIds: Array<number | string | { deviceId: number }> = [],
  fetchBundle: (
    userId: string,
    deviceId: number
  ) => Promise<PreKeyBundleResponse> = fetchPreKeyBundle
): Promise<OutgoingEncryptedMessage> {
  const textError = validateMessageContent(content);
  if (textError) throw new Error(textError);
  const plaintext = serializeMessageContent(content);
  const recipientIds = normalizeDeviceIdList(recipientDeviceIds);
  const ownIds = normalizeDeviceIdList(ownOtherDeviceIds);
  const recipientCiphertexts: Record<string, string> = {};
  let recipientPayload: import("@vaultchat/crypto").EncryptedPayload | undefined;

  for (const deviceId of recipientIds) {
    const payload = await encryptForDevice(
      device,
      recipientId,
      deviceId,
      plaintext,
      fetchBundle
    );
    recipientCiphertexts[String(deviceId)] = JSON.stringify(payload);
    if (!recipientPayload || deviceId === 1) {
      recipientPayload = payload;
    }
  }

  if (!recipientPayload) {
    throw new Error("Recipient has no registered devices");
  }

  const senderCiphertexts: Record<string, string> = {};
  // Copies for other linked installs only. The sending device keeps plaintext in
  // the local sealed cache/timeline (and account backup) — Signal cannot encrypt
  // to the same device address it is sending from.
  for (const deviceId of ownIds) {
    if (deviceId === device.deviceId) continue;
    const payload = await encryptForDevice(
      device,
      senderUserId,
      deviceId,
      plaintext,
      fetchBundle
    );
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
  const hasSession = await device.hasOpenSession(recipientId, recipientDeviceId);
  return device.encrypt(
    recipientId,
    recipientDeviceId,
    plaintext,
    hasSession ? undefined : bundle
  );
}

export function groupByDate(
  messages: DisplayMessage[]
): { date: string; messages: DisplayMessage[] }[] {
  const groups: { date: string; messages: DisplayMessage[] }[] = [];
  let current: { date: string; messages: DisplayMessage[] } | null = null;

  // Derive labels from timestamps — cached `msg.date` strings go stale overnight.
  for (const msg of sortMessages(messages)) {
    const date = formatMessageDate(msg.time);
    if (!current || current.date !== date) {
      current = { date, messages: [] };
      groups.push(current);
    }
    current.messages.push(msg);
  }

  return groups;
}

export const MAX_INLINE_IMAGE_BYTES = 500 * 1024;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
