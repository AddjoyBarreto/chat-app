import { GroupCipher, type VaultDevice } from "@vaultchat/crypto";
import {
  createGroup,
  createLocalStorageAdapter,
  decryptChannelEnvelope,
  decryptGroupEnvelope,
  distributeGroupKey,
  fetchGroupMembers,
  fetchGroupMessages,
  loadChannelHistory,
  loadGroupCipher,
  reshareGroupKey,
  saveGroupKey,
  sendChannelContentMessage,
  sendGroupContentMessage,
  shareGroupKeyWithMember,
} from "@vaultchat/client";
import type {
  ChannelMessageEnvelope,
  GroupMessageEnvelope,
  MessageContent,
} from "@vaultchat/protocol";
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

export async function loadCommunityChannelMessages(
  token: string,
  communityId: string,
  channelId: string,
  userId: string,
  opts?: {
    cursor?: string;
    limit?: number;
    legacy?: boolean;
    allowLegacyFallback?: boolean;
  }
): Promise<{ messages: GroupDisplayMessage[]; cursor?: string; hasMore: boolean; legacy?: boolean }> {
  const page = await loadChannelHistory(storage, token, communityId, channelId, userId, opts);
  return {
    messages: page.messages.map(toDisplayMessage),
    cursor: page.cursor,
    hasMore: page.hasMore,
    legacy: page.legacy,
  };
}

export async function decryptIncomingGroupMessage(
  groupId: string,
  envelope: GroupMessageEnvelope,
  userId: string
): Promise<GroupDisplayMessage> {
  const msg = await decryptGroupEnvelope(storage, groupId, envelope, userId);
  return toDisplayMessage(msg);
}

export async function decryptIncomingChannelMessage(
  communityId: string,
  envelope: ChannelMessageEnvelope,
  userId: string
): Promise<GroupDisplayMessage> {
  const msg = await decryptChannelEnvelope(storage, communityId, envelope, userId);
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

export async function sendChannelTextMessage(
  token: string,
  userId: string,
  communityId: string,
  channelId: string,
  text: string
) {
  return sendChannelContentMessage(
    storage,
    userId,
    token,
    communityId,
    channelId,
    { type: "text", text },
    "text"
  );
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

export async function ensureCommunityEncryption(
  token: string,
  device: VaultDevice,
  userId: string,
  groupId: string
): Promise<{ hasKey: boolean; recovered: boolean }> {
  const existing = await loadGroupCipher(storage, userId, groupId);
  if (existing) return { hasKey: true, recovered: false };

  const members = await fetchGroupMembers(token, groupId);
  const me = members.find((m) => m.userId === userId);
  if (!me || me.role !== "admin") return { hasKey: false, recovered: false };

  const { messages } = await fetchGroupMessages(token, groupId, { limit: 1 });
  if (messages.length > 0) return { hasKey: false, recovered: false };

  const { keyBase64 } = await GroupCipher.generate();
  await saveGroupKey(storage, userId, groupId, keyBase64);
  await distributeGroupKey(storage, token, device, userId, groupId, keyBase64);
  return { hasKey: true, recovered: true };
}

export async function shareGroupKeyWithMemberForCommunity(
  token: string,
  device: VaultDevice,
  userId: string,
  groupId: string,
  targetUserId: string
) {
  return shareGroupKeyWithMember(storage, token, device, userId, groupId, targetUserId);
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
    senderId: msg.senderId,
  };
}

function formatGroupDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export { storage as groupStorage };
