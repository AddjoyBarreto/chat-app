import { serializeMessageContent, type VaultDevice } from "@vaultchat/crypto";
import type { MessageContent, MessageType } from "@vaultchat/protocol";
import { fetchPreKeyBundle, sendEncryptedMessage } from "./api.js";
import { getStoredGroupKey, loadGroupCipher } from "./group-keys.js";
import { fetchGroupMembers, sendGroupMessage } from "./groups.js";
import type { StorageAdapter } from "./storage.js";

export async function distributeGroupKey(
  storage: StorageAdapter,
  token: string,
  device: VaultDevice,
  userId: string,
  groupId: string,
  keyBase64: string
): Promise<void> {
  const members = await fetchGroupMembers(token, groupId);
  for (const member of members) {
    if (member.userId === userId) continue;
    const bundle = await fetchPreKeyBundle(member.userId);
    const plaintext = serializeMessageContent({
      type: "group_key",
      groupKey: { groupId, key: keyBase64 },
    });
    const encrypted = await device.encrypt(member.userId, bundle.deviceId, plaintext, bundle);
    await sendEncryptedMessage(token, member.userId, encrypted, "text", undefined, bundle.deviceId);
  }
}

export async function reshareGroupKey(
  storage: StorageAdapter,
  token: string,
  device: VaultDevice,
  userId: string,
  groupId: string
): Promise<{ sharedWith: number }> {
  const members = await fetchGroupMembers(token, groupId);
  const me = members.find((m) => m.userId === userId);
  if (!me || me.role !== "admin") {
    throw new Error("Only group admins can re-share the encryption key");
  }

  const keyBase64 = await getStoredGroupKey(storage, userId, groupId);
  if (!keyBase64) {
    throw new Error("You don't have the group encryption key on this device");
  }

  await distributeGroupKey(storage, token, device, userId, groupId, keyBase64);
  return { sharedWith: members.filter((m) => m.userId !== userId).length };
}

export async function sendGroupContentMessage(
  storage: StorageAdapter,
  userId: string,
  token: string,
  groupId: string,
  content: MessageContent,
  messageType: MessageType
): Promise<{ messageId: string; createdAt: string }> {
  const cipher = await loadGroupCipher(storage, userId, groupId);
  if (!cipher) throw new Error("Group encryption key not found");
  const payload = await cipher.encrypt(serializeMessageContent(content));
  return sendGroupMessage(token, groupId, { ciphertext: payload, messageType });
}

export function previewGroupContent(content: MessageContent): string {
  if (content.type === "image") return "📷 Photo";
  if (content.type === "video") return "🎬 Video";
  if (content.type === "media") {
    return content.media?.mime.startsWith("video/") ? "🎬 Video" : "📷 Photo";
  }
  return content.text ?? "";
}
