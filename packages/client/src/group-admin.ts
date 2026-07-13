import { GroupCipher, serializeMessageContent, type VaultDevice } from "@vaultchat/crypto";
import type { MessageContent, MessageType } from "@vaultchat/protocol";
import {
  fetchOwnDeviceBundles,
  fetchPreKeyBundle,
  sendEncryptedMessage,
} from "./api.js";
import { getStoredGroupKey, loadGroupCipher, saveGroupKey } from "./group-keys.js";
import { fetchGroupMembers, sendGroupMessage } from "./groups.js";
import { validateMessageContent } from "./messages.js";
import type { StorageAdapter } from "./storage.js";

/**
 * Push a community AES key to this user's other linked devices (self-DM).
 * Required because web/desktop/mobile do not share localStorage.
 */
export async function syncGroupKeyToOwnDevices(
  token: string,
  device: VaultDevice,
  userId: string,
  groupId: string,
  keyBase64: string
): Promise<number> {
  const ownBundles = await fetchOwnDeviceBundles(token, userId);
  let sent = 0;
  for (const { deviceId, bundle } of ownBundles) {
    if (deviceId === device.deviceId) continue;
    const plaintext = serializeMessageContent({
      type: "group_key",
      groupKey: { groupId, key: keyBase64 },
    });
    const encrypted = await device.encrypt(userId, deviceId, plaintext, bundle);
    await sendEncryptedMessage(token, userId, encrypted, "text", undefined, deviceId);
    sent++;
  }
  return sent;
}

export async function distributeGroupKey(
  storage: StorageAdapter,
  token: string,
  device: VaultDevice,
  userId: string,
  groupId: string,
  keyBase64: string
): Promise<void> {
  await saveGroupKey(storage, userId, groupId, keyBase64);
  const members = await fetchGroupMembers(token, groupId);
  for (const member of members) {
    if (member.userId === userId) continue;
    await distributeGroupKeyToMember(storage, token, device, userId, groupId, keyBase64, member.userId);
  }
  await syncGroupKeyToOwnDevices(token, device, userId, groupId, keyBase64);
}

export async function distributeGroupKeyToMember(
  storage: StorageAdapter,
  token: string,
  device: VaultDevice,
  userId: string,
  groupId: string,
  keyBase64: string,
  targetUserId: string
): Promise<void> {
  if (targetUserId === userId) {
    await syncGroupKeyToOwnDevices(token, device, userId, groupId, keyBase64);
    return;
  }
  const bundle = await fetchPreKeyBundle(targetUserId);
  const plaintext = serializeMessageContent({
    type: "group_key",
    groupKey: { groupId, key: keyBase64 },
  });
  const encrypted = await device.encrypt(targetUserId, bundle.deviceId, plaintext, bundle);
  await sendEncryptedMessage(token, targetUserId, encrypted, "text", undefined, bundle.deviceId);
}

export async function shareGroupKeyWithMember(
  storage: StorageAdapter,
  token: string,
  device: VaultDevice,
  userId: string,
  groupId: string,
  targetUserId: string
): Promise<void> {
  const keyBase64 = await getStoredGroupKey(storage, userId, groupId);
  if (!keyBase64) throw new Error("Group encryption key not found on this device");
  await distributeGroupKeyToMember(storage, token, device, userId, groupId, keyBase64, targetUserId);
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

/**
 * Mint a fresh community AES key and distribute it to all members.
 * Use when this admin device no longer has the key (e.g. after a destructive wipe).
 * Prior messages encrypted under the old key stay undecryptable.
 */
export async function resetGroupEncryptionKey(
  storage: StorageAdapter,
  token: string,
  device: VaultDevice,
  userId: string,
  groupId: string
): Promise<{ sharedWith: number }> {
  const members = await fetchGroupMembers(token, groupId);
  const me = members.find((m) => m.userId === userId);
  if (!me || me.role !== "admin") {
    throw new Error("Only group admins can reset the encryption key");
  }

  const { keyBase64 } = await GroupCipher.generate();
  await distributeGroupKey(storage, token, device, userId, groupId, keyBase64);
  return { sharedWith: members.filter((m) => m.userId !== userId).length };
}

/** Push local community keys to other devices for this account (no-op if alone). */
export async function syncAllGroupKeysToOwnDevices(
  storage: StorageAdapter,
  token: string,
  device: VaultDevice,
  userId: string,
  groupIds: string[]
): Promise<number> {
  let total = 0;
  for (const groupId of groupIds) {
    const key = await getStoredGroupKey(storage, userId, groupId);
    if (!key) continue;
    total += await syncGroupKeyToOwnDevices(token, device, userId, groupId, key);
  }
  return total;
}

export async function sendGroupContentMessage(
  storage: StorageAdapter,
  userId: string,
  token: string,
  groupId: string,
  content: MessageContent,
  messageType: MessageType
): Promise<{ messageId: string; createdAt: string }> {
  if (messageType === "text") {
    const textError = validateMessageContent(content);
    if (textError) throw new Error(textError);
  }
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
