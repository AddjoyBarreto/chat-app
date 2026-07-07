import {
  channelCategories,
  channelMembers,
  channelMessages,
  channels,
  groupMembers,
  users,
  voicePresence,
} from "@vaultchat/db";
import type {
  AddChannelMemberRequest,
  ChannelCategoryInfo,
  ChannelInfo,
  ChannelMemberInfo,
  ChannelMessageEnvelope,
  ChannelMessagesResponse,
  ChannelType,
  CreateCategoryRequest,
  CreateChannelRequest,
  SendChannelMessageRequest,
  UpdateChannelRequest,
  VoicePresenceResponse,
} from "@vaultchat/protocol";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import type { ApiContext } from "./context.js";
import { requireVerifiedEmail } from "./auth-users.js";
import { ApiCoreError } from "./errors.js";
import { clampPageSize } from "./pagination.js";
import { publishChannelMessage } from "./redis.js";

const CHANNEL_NAME_RE = /^[a-z0-9_-]{2,32}$/;
const MAX_CIPHERTEXT_CHARS = 131_072;

async function assertMember(ctx: ApiContext, userId: string, communityId: string) {
  const [m] = await ctx.db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, communityId), eq(groupMembers.userId, userId)))
    .limit(1);
  if (!m) throw new ApiCoreError("Not a community member", 403, "NOT_MEMBER");
}

async function assertAdmin(ctx: ApiContext, userId: string, communityId: string) {
  const [m] = await ctx.db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, communityId), eq(groupMembers.userId, userId)))
    .limit(1);
  if (!m || m.role !== "admin") {
    throw new ApiCoreError("Admin access required", 403, "NOT_ADMIN");
  }
}

type ChannelRow = typeof channels.$inferSelect;

function toChannelInfo(row: ChannelRow): ChannelInfo {
  return {
    id: row.id,
    communityId: row.communityId,
    categoryId: row.categoryId ?? undefined,
    name: row.name,
    type: row.type as ChannelType,
    topic: row.topic ?? undefined,
    isPrivate: row.isPrivate,
    position: row.position,
  };
}

async function isCommunityAdmin(
  ctx: ApiContext,
  userId: string,
  communityId: string
): Promise<boolean> {
  const [m] = await ctx.db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, communityId), eq(groupMembers.userId, userId)))
    .limit(1);
  return m?.role === "admin";
}

async function userCanAccessChannel(
  ctx: ApiContext,
  userId: string,
  channel: ChannelRow
): Promise<boolean> {
  if (!channel.isPrivate) return true;
  if (await isCommunityAdmin(ctx, userId, channel.communityId)) return true;
  const [member] = await ctx.db
    .select({ id: channelMembers.id })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channel.id), eq(channelMembers.userId, userId)))
    .limit(1);
  return !!member;
}

async function assertChannelAccess(
  ctx: ApiContext,
  userId: string,
  channelId: string
): Promise<ChannelRow> {
  const [channel] = await ctx.db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) throw new ApiCoreError("Channel not found", 404, "NOT_FOUND");

  await assertMember(ctx, userId, channel.communityId);
  if (!(await userCanAccessChannel(ctx, userId, channel))) {
    throw new ApiCoreError("You do not have access to this channel", 403, "CHANNEL_ACCESS_DENIED");
  }
  return channel;
}

export async function getChannelAccessUserIds(
  ctx: ApiContext,
  channel: Pick<ChannelRow, "id" | "communityId" | "isPrivate">
): Promise<string[]> {
  if (!channel.isPrivate) {
    const members = await ctx.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, channel.communityId));
    return members.map((m) => m.userId);
  }

  const [explicitMembers, admins] = await Promise.all([
    ctx.db
      .select({ userId: channelMembers.userId })
      .from(channelMembers)
      .where(eq(channelMembers.channelId, channel.id)),
    ctx.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, channel.communityId), eq(groupMembers.role, "admin"))),
  ]);

  return [...new Set([...explicitMembers.map((m) => m.userId), ...admins.map((m) => m.userId)])];
}

export async function createDefaultCommunityChannels(
  ctx: ApiContext,
  communityId: string
): Promise<void> {
  const [textCategory] = await ctx.db
    .insert(channelCategories)
    .values({ communityId, name: "Text Channels", position: 0 })
    .returning({ id: channelCategories.id });

  await ctx.db.insert(channels).values({
    communityId,
    categoryId: textCategory.id,
    name: "general",
    type: "text",
    position: 0,
  });

  const [voiceCategory] = await ctx.db
    .insert(channelCategories)
    .values({ communityId, name: "Voice Channels", position: 1 })
    .returning({ id: channelCategories.id });

  await ctx.db.insert(channels).values({
    communityId,
    categoryId: voiceCategory.id,
    name: "general",
    type: "voice",
    position: 0,
  });
}

/** Backfill default voice channel for groups created before voice was added. */
export async function ensureDefaultCommunityChannels(
  ctx: ApiContext,
  communityId: string
): Promise<void> {
  const existing = await ctx.db
    .select()
    .from(channels)
    .where(eq(channels.communityId, communityId));

  if (existing.length === 0) {
    await createDefaultCommunityChannels(ctx, communityId);
    return;
  }

  const hasVoice = existing.some((c) => c.type === "voice");
  if (hasVoice) return;

  let voiceCategory = await ctx.db
    .select()
    .from(channelCategories)
    .where(
      and(
        eq(channelCategories.communityId, communityId),
        eq(channelCategories.name, "Voice Channels")
      )
    )
    .limit(1);

  let categoryId = voiceCategory[0]?.id;
  if (!categoryId) {
    const [created] = await ctx.db
      .insert(channelCategories)
      .values({ communityId, name: "Voice Channels", position: 1 })
      .returning({ id: channelCategories.id });
    categoryId = created.id;
  }

  await ctx.db.insert(channels).values({
    communityId,
    categoryId,
    name: "general",
    type: "voice",
    position: 0,
  });
}

export async function listChannelCategories(
  ctx: ApiContext,
  userId: string,
  communityId: string
): Promise<{ categories: ChannelCategoryInfo[] }> {
  await assertMember(ctx, userId, communityId);
  const rows = await ctx.db
    .select()
    .from(channelCategories)
    .where(eq(channelCategories.communityId, communityId))
    .orderBy(asc(channelCategories.position));

  return {
    categories: rows.map((r) => ({
      id: r.id,
      communityId: r.communityId,
      name: r.name,
      position: r.position,
    })),
  };
}

export async function createChannelCategory(
  ctx: ApiContext,
  userId: string,
  communityId: string,
  body: CreateCategoryRequest
): Promise<ChannelCategoryInfo> {
  await assertAdmin(ctx, userId, communityId);
  const name = body.name.trim();
  if (name.length < 1 || name.length > 64) {
    throw new ApiCoreError("Invalid category name", 400, "INVALID_NAME");
  }

  const [row] = await ctx.db
    .insert(channelCategories)
    .values({ communityId, name, position: 99 })
    .returning();

  return {
    id: row.id,
    communityId: row.communityId,
    name: row.name,
    position: row.position,
  };
}

export async function listChannels(
  ctx: ApiContext,
  userId: string,
  communityId: string
): Promise<{ channels: ChannelInfo[] }> {
  await assertMember(ctx, userId, communityId);
  await ensureDefaultCommunityChannels(ctx, communityId);
  const rows = await ctx.db
    .select()
    .from(channels)
    .where(eq(channels.communityId, communityId))
    .orderBy(asc(channels.position));

  const visible: ChannelInfo[] = [];
  for (const row of rows) {
    if (await userCanAccessChannel(ctx, userId, row)) {
      visible.push(toChannelInfo(row));
    }
  }

  return { channels: visible };
}

export async function createChannel(
  ctx: ApiContext,
  userId: string,
  communityId: string,
  body: CreateChannelRequest
): Promise<ChannelInfo> {
  await assertAdmin(ctx, userId, communityId);
  const name = body.name.trim().toLowerCase();
  if (!CHANNEL_NAME_RE.test(name)) {
    throw new ApiCoreError(
      "Channel name must be 2–32 chars: lowercase letters, numbers, - or _",
      400,
      "INVALID_CHANNEL_NAME"
    );
  }

  const type = body.type ?? "text";
  if (!["text", "voice", "announcement"].includes(type)) {
    throw new ApiCoreError("Invalid channel type", 400, "INVALID_CHANNEL_TYPE");
  }

  const [row] = await ctx.db
    .insert(channels)
    .values({
      communityId,
      categoryId: body.categoryId,
      name,
      type,
      topic: body.topic?.trim(),
      isPrivate: body.isPrivate ?? false,
      position: 99,
    })
    .returning();

  return toChannelInfo(row);
}

export async function updateChannel(
  ctx: ApiContext,
  userId: string,
  channelId: string,
  body: UpdateChannelRequest
): Promise<ChannelInfo> {
  const [channel] = await ctx.db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) throw new ApiCoreError("Channel not found", 404, "NOT_FOUND");

  await assertAdmin(ctx, userId, channel.communityId);

  const updates: { name?: string; topic?: string | null; isPrivate?: boolean } = {};
  if (body.name !== undefined) {
    const name = body.name.trim().toLowerCase();
    if (!CHANNEL_NAME_RE.test(name)) {
      throw new ApiCoreError(
        "Channel name must be 2–32 chars: lowercase letters, numbers, - or _",
        400,
        "INVALID_CHANNEL_NAME"
      );
    }
    updates.name = name;
  }
  if (body.topic !== undefined) {
    updates.topic = body.topic.trim() || null;
  }
  if (body.isPrivate !== undefined) {
    updates.isPrivate = body.isPrivate;
  }

  if (Object.keys(updates).length === 0) {
    return toChannelInfo(channel);
  }

  const [row] = await ctx.db
    .update(channels)
    .set(updates)
    .where(eq(channels.id, channelId))
    .returning();

  return toChannelInfo(row);
}

export async function deleteChannel(
  ctx: ApiContext,
  userId: string,
  channelId: string
): Promise<{ ok: true }> {
  const [channel] = await ctx.db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) throw new ApiCoreError("Channel not found", 404, "NOT_FOUND");

  await assertAdmin(ctx, userId, channel.communityId);

  const communityChannels = await ctx.db
    .select({ id: channels.id, type: channels.type })
    .from(channels)
    .where(eq(channels.communityId, channel.communityId));

  if (channel.type === "text") {
    const textCount = communityChannels.filter((c) => c.type === "text").length;
    if (textCount <= 1) {
      throw new ApiCoreError("Cannot delete the last text channel", 400, "INVALID_REQUEST");
    }
  }

  await ctx.db.delete(channels).where(eq(channels.id, channelId));
  return { ok: true };
}

export async function getChannelMessages(
  ctx: ApiContext,
  userId: string,
  channelId: string,
  cursor?: string,
  limit = 50
): Promise<ChannelMessagesResponse> {
  await assertChannelAccess(ctx, userId, channelId);

  const pageSize = clampPageSize(limit);
  let cursorDate: Date | undefined;
  if (cursor) {
    cursorDate = new Date(cursor);
    if (Number.isNaN(cursorDate.getTime())) {
      throw new ApiCoreError("Invalid cursor", 400, "INVALID_CURSOR");
    }
  }

  const whereClause = cursorDate
    ? and(eq(channelMessages.channelId, channelId), lt(channelMessages.createdAt, cursorDate))
    : eq(channelMessages.channelId, channelId);

  const rows = await ctx.db
    .select()
    .from(channelMessages)
    .where(whereClause)
    .orderBy(desc(channelMessages.createdAt))
    .limit(pageSize);

  const messages: ChannelMessageEnvelope[] = rows
    .map((row) => ({
      id: row.id,
      channelId: row.channelId,
      senderId: row.senderId,
      senderDeviceId: row.senderDeviceId,
      ciphertext: row.ciphertext,
      messageType: row.messageType as ChannelMessageEnvelope["messageType"],
      createdAt: row.createdAt.toISOString(),
    }))
    .reverse();

  return {
    messages,
    cursor: rows.length === pageSize ? rows[rows.length - 1]?.createdAt.toISOString() : undefined,
    hasMore: rows.length === pageSize,
  };
}

export async function sendChannelMessage(
  ctx: ApiContext,
  senderId: string,
  senderDeviceId: number,
  channelId: string,
  body: SendChannelMessageRequest
): Promise<{ messageId: string; createdAt: string }> {
  await requireVerifiedEmail(ctx, senderId);

  const channel = await assertChannelAccess(ctx, senderId, channelId);
  if (channel.type !== "text" && channel.type !== "announcement") {
    throw new ApiCoreError("Cannot send messages in this channel type", 400, "INVALID_CHANNEL");
  }

  if (!body.ciphertext?.trim()) {
    throw new ApiCoreError("Message payload required", 400, "INVALID_MESSAGE");
  }
  if (body.ciphertext.length > MAX_CIPHERTEXT_CHARS) {
    throw new ApiCoreError("Message too large", 413, "MESSAGE_TOO_LARGE");
  }

  const [row] = await ctx.db
    .insert(channelMessages)
    .values({
      channelId,
      senderId,
      senderDeviceId,
      ciphertext: body.ciphertext,
      messageType: body.messageType,
    })
    .returning({ id: channelMessages.id, createdAt: channelMessages.createdAt });

  const envelope: ChannelMessageEnvelope = {
    id: row.id,
    channelId,
    senderId,
    senderDeviceId,
    ciphertext: body.ciphertext,
    messageType: body.messageType,
    createdAt: row.createdAt.toISOString(),
  };

  await publishChannelMessage(ctx, channelId, envelope);

  return { messageId: row.id, createdAt: row.createdAt.toISOString() };
}

export async function joinVoiceChannel(
  ctx: ApiContext,
  userId: string,
  channelId: string
): Promise<VoicePresenceResponse> {
  const channel = await assertChannelAccess(ctx, userId, channelId);
  if (channel.type !== "voice") {
    throw new ApiCoreError("Not a voice channel", 400, "INVALID_CHANNEL");
  }

  await ctx.db
    .insert(voicePresence)
    .values({ channelId, userId })
    .onConflictDoNothing();

  return getVoicePresence(ctx, userId, channelId);
}

export async function leaveVoiceChannel(
  ctx: ApiContext,
  userId: string,
  channelId: string
): Promise<VoicePresenceResponse> {
  await ctx.db
    .delete(voicePresence)
    .where(and(eq(voicePresence.channelId, channelId), eq(voicePresence.userId, userId)));

  return getVoicePresence(ctx, userId, channelId);
}

export async function getVoicePresence(
  ctx: ApiContext,
  userId: string,
  channelId: string
): Promise<VoicePresenceResponse> {
  await assertChannelAccess(ctx, userId, channelId);

  const rows = await ctx.db
    .select({
      userId: voicePresence.userId,
      username: users.username,
      joinedAt: voicePresence.joinedAt,
    })
    .from(voicePresence)
    .innerJoin(users, eq(voicePresence.userId, users.id))
    .where(eq(voicePresence.channelId, channelId));

  const members = rows.map((r) => ({
    userId: r.userId,
    username: r.username,
    joinedAt: r.joinedAt.toISOString(),
  }));

  await ctx.redis.publish(
    `vaultchat:channel:${channelId}`,
    JSON.stringify({ type: "voice_presence", channelId, members })
  );

  return { members };
}

export async function listChannelMembers(
  ctx: ApiContext,
  userId: string,
  channelId: string
): Promise<{ members: ChannelMemberInfo[] }> {
  const channel = await assertChannelAccess(ctx, userId, channelId);
  await assertAdmin(ctx, userId, channel.communityId);

  const rows = await ctx.db
    .select({
      userId: channelMembers.userId,
      username: users.username,
    })
    .from(channelMembers)
    .innerJoin(users, eq(channelMembers.userId, users.id))
    .where(eq(channelMembers.channelId, channelId));

  return {
    members: rows.map((r) => ({ userId: r.userId, username: r.username })),
  };
}

export async function addChannelMember(
  ctx: ApiContext,
  adminId: string,
  channelId: string,
  body: AddChannelMemberRequest
): Promise<ChannelMemberInfo> {
  const [channel] = await ctx.db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) throw new ApiCoreError("Channel not found", 404, "NOT_FOUND");
  await assertAdmin(ctx, adminId, channel.communityId);

  const [communityMember] = await ctx.db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, channel.communityId), eq(groupMembers.userId, body.userId)))
    .limit(1);
  if (!communityMember) {
    throw new ApiCoreError("User is not a community member", 404, "NOT_FOUND");
  }

  const [existing] = await ctx.db
    .select({ id: channelMembers.id })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, body.userId)))
    .limit(1);
  if (existing) {
    throw new ApiCoreError("User already has access to this channel", 409, "ALREADY_MEMBER");
  }

  await ctx.db.insert(channelMembers).values({
    channelId,
    userId: body.userId,
  });

  const [user] = await ctx.db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, body.userId))
    .limit(1);

  return { userId: body.userId, username: user?.username ?? "unknown" };
}

export async function removeChannelMember(
  ctx: ApiContext,
  adminId: string,
  channelId: string,
  targetUserId: string
): Promise<{ ok: true }> {
  const [channel] = await ctx.db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) throw new ApiCoreError("Channel not found", 404, "NOT_FOUND");
  await assertAdmin(ctx, adminId, channel.communityId);

  await ctx.db
    .delete(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, targetUserId)));

  return { ok: true };
}
