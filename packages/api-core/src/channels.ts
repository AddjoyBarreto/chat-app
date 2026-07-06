import {
  channelCategories,
  channelMessages,
  channels,
  groupMembers,
  users,
  voicePresence,
} from "@vaultchat/db";
import type {
  ChannelCategoryInfo,
  ChannelInfo,
  ChannelMessageEnvelope,
  ChannelMessagesResponse,
  ChannelType,
  CreateCategoryRequest,
  CreateChannelRequest,
  SendChannelMessageRequest,
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

export async function createDefaultCommunityChannels(
  ctx: ApiContext,
  communityId: string
): Promise<void> {
  const [category] = await ctx.db
    .insert(channelCategories)
    .values({ communityId, name: "Text Channels", position: 0 })
    .returning({ id: channelCategories.id });

  await ctx.db.insert(channels).values({
    communityId,
    categoryId: category.id,
    name: "general",
    type: "text",
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
  const rows = await ctx.db
    .select()
    .from(channels)
    .where(eq(channels.communityId, communityId))
    .orderBy(asc(channels.position));

  return {
    channels: rows.map((r) => ({
      id: r.id,
      communityId: r.communityId,
      categoryId: r.categoryId ?? undefined,
      name: r.name,
      type: r.type as ChannelType,
      topic: r.topic ?? undefined,
      position: r.position,
    })),
  };
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
      position: 99,
    })
    .returning();

  return {
    id: row.id,
    communityId: row.communityId,
    categoryId: row.categoryId ?? undefined,
    name: row.name,
    type: row.type as ChannelType,
    topic: row.topic ?? undefined,
    position: row.position,
  };
}

export async function getChannelMessages(
  ctx: ApiContext,
  userId: string,
  channelId: string,
  cursor?: string,
  limit = 50
): Promise<ChannelMessagesResponse> {
  const [channel] = await ctx.db
    .select({ communityId: channels.communityId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) throw new ApiCoreError("Channel not found", 404, "NOT_FOUND");

  await assertMember(ctx, userId, channel.communityId);

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

  const [channel] = await ctx.db
    .select({ communityId: channels.communityId, type: channels.type })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) throw new ApiCoreError("Channel not found", 404, "NOT_FOUND");
  if (channel.type !== "text" && channel.type !== "announcement") {
    throw new ApiCoreError("Cannot send messages in this channel type", 400, "INVALID_CHANNEL");
  }

  await assertMember(ctx, senderId, channel.communityId);

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
  const [channel] = await ctx.db
    .select({ communityId: channels.communityId, type: channels.type })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) throw new ApiCoreError("Channel not found", 404, "NOT_FOUND");
  if (channel.type !== "voice") {
    throw new ApiCoreError("Not a voice channel", 400, "INVALID_CHANNEL");
  }

  await assertMember(ctx, userId, channel.communityId);

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
  const [channel] = await ctx.db
    .select({ communityId: channels.communityId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) throw new ApiCoreError("Channel not found", 404, "NOT_FOUND");
  await assertMember(ctx, userId, channel.communityId);

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
