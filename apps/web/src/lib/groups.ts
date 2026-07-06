import { GroupCipher, type VaultDevice } from "@vaultchat/crypto";
import {
  createGroup,
  createLocalStorageAdapter,
  decryptGroupEnvelope,
  distributeGroupKey,
  fetchGroupMembers,
  fetchGroupMessages,
  loadGroupCipher,
  reshareGroupKey,
  saveGroupKey,
  sendGroupContentMessage,
} from "@vaultchat/client";
import type { GroupMessageEnvelope, MessageContent } from "@vaultchat/protocol";
import type { GroupDisplayMessage } from "@/components/chat/GroupConversationView";

const storage = createLocalStorageAdapter();

export async function createGroupWithKey(
  token: string,
  device: VaultDevice,
  userId: string,
  name: string,
  memberUsernames: string[]
) {
  const group = await createGroup(token, { name, memberUsernames });
  const { keyBase64 } = await GroupCipher.generate();
  await saveGroupKey(storage, userId, group.id, keyBase64);
  await distributeGroupKey(storage, token, device, userId, group.id, keyBase64);
  return group;
}

export async function getGroupAccess(
  token: string,
  groupId: string,
  userId: string
): Promise<{ isAdmin: boolean; hasKey: boolean }> {
  const members = await fetchGroupMembers(token, groupId);
  const me = members.find((m) => m.userId === userId);
  const cipher = await loadGroupCipher(storage, userId, groupId);
  return {
    isAdmin: me?.role === "admin",
    hasKey: cipher !== null,
  };
}

export async function loadGroupMessages(
  token: string,
  groupId: string,
  userId: string
): Promise<GroupDisplayMessage[]> {
  const { messages: envelopes } = await fetchGroupMessages(token, groupId);
  const parsed: GroupDisplayMessage[] = [];

  for (const e of envelopes) {
    const msg = await decryptGroupEnvelope(storage, groupId, e, userId);
    parsed.push(toDisplayMessage(msg));
  }

  return parsed;
}

export async function decryptIncomingGroupMessage(
  groupId: string,
  envelope: GroupMessageEnvelope,
  userId: string
): Promise<GroupDisplayMessage> {
  const msg = await decryptGroupEnvelope(storage, groupId, envelope, userId);
  return toDisplayMessage(msg);
}

export async function sendGroupTextMessage(
  token: string,
  userId: string,
  groupId: string,
  text: string
) {
  return sendGroupContentMessage(storage, userId, token, groupId, { type: "text", text }, "text");
}

export async function sendGroupMediaMessage(
  token: string,
  userId: string,
  groupId: string,
  content: MessageContent,
  messageType: "image" | "video"
) {
  return sendGroupContentMessage(storage, userId, token, groupId, content, messageType);
}

export async function adminReshareGroupKey(
  token: string,
  device: VaultDevice,
  userId: string,
  groupId: string
) {
  return reshareGroupKey(storage, token, device, userId, groupId);
}

function toDisplayMessage(msg: Awaited<ReturnType<typeof decryptGroupEnvelope>>): GroupDisplayMessage {
  return {
    id: msg.id,
    from: msg.from,
    text: msg.text,
    content: msg.content,
    time: msg.time,
    date: formatGroupDate(msg.time),
    failed: msg.failed,
  };
}

function formatGroupDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export { storage as groupStorage };
