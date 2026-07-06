import { groupMembers, groupMessages, groups, users } from "@vaultchat/db";
import type {
  CreateGroupRequest,
  GroupInfo,
  GroupMemberInfo,
  GroupMessageEnvelope,
  GroupMessagesResponse,
  SendGroupMessageRequest,
} from "@vaultchat/protocol";
import { and, count, desc, eq, inArray, lt } from "drizzle-orm";
import type { ApiContext } from "./context.js";
import { requireVerifiedEmail } from "./auth-users.js";
import { createDefaultCommunityChannels } from "./channels.js";
import { ApiCoreError } from "./errors.js";
import { clampPageSize } from "./pagination.js";
import { publishGroupMessage } from "./redis.js";

const GROUP_NAME_RE = /^[a-zA-Z0-9 _-]{2,64}$/;
const MAX_CIPHERTEXT_CHARS = 131_072;

export async function createGroup(
  ctx: ApiContext,
  creatorId: string,
  body: CreateGroupRequest
): Promise<GroupInfo> {
  await requireVerifiedEmail(ctx, creatorId);
  const name = body.name.trim();
  if (!GROUP_NAME_RE.test(name)) {
    throw new ApiCoreError("Invalid group name", 400, "INVALID_GROUP_NAME");
  }

  const usernames = [...new Set(body.memberUsernames.map((u) => u.trim().toLowerCase()))];
  const memberUsers =
    usernames.length > 0
      ? await ctx.db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.username, usernames))
      : [];

  if (memberUsers.length !== usernames.length) {
    throw new ApiCoreError("One or more members not found", 404, "MEMBER_NOT_FOUND");
  }

  const [group] = await ctx.db
    .insert(groups)
    .values({ name, createdBy: creatorId })
    .returning();

  const memberIds = new Set([creatorId, ...memberUsers.map((m) => m.id)]);
  await ctx.db.insert(groupMembers).values(
    [...memberIds].map((userId) => ({
      groupId: group.id,
      userId,
      role: userId === creatorId ? "admin" : "member",
    }))
  );

  await createDefaultCommunityChannels(ctx, group.id);

  return {
    id: group.id,
    name: group.name,
    description: group.description ?? undefined,
    iconUrl: group.iconUrl ?? undefined,
    createdBy: group.createdBy,
    memberCount: memberIds.size,
    createdAt: group.createdAt.toISOString(),
  };
}

export async function listUserGroups(ctx: ApiContext, userId: string): Promise<GroupInfo[]> {
  const memberships = await ctx.db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));

  if (memberships.length === 0) return [];

  const groupIds = memberships.map((m) => m.groupId);
  const rows = await ctx.db.select().from(groups).where(inArray(groups.id, groupIds));

  const memberCounts = await ctx.db
    .select({ groupId: groupMembers.groupId, memberCount: count() })
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, groupIds))
    .groupBy(groupMembers.groupId);

  const countByGroup = new Map(
    memberCounts.map((row) => [row.groupId, Number(row.memberCount)])
  );

  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description ?? undefined,
    iconUrl: g.iconUrl ?? undefined,
    createdBy: g.createdBy,
    memberCount: countByGroup.get(g.id) ?? 0,
    createdAt: g.createdAt.toISOString(),
  }));
}

export async function getGroupMembers(
  ctx: ApiContext,
  userId: string,
  groupId: string
): Promise<GroupMemberInfo[]> {
  await assertMember(ctx, userId, groupId);

  const rows = await ctx.db
    .select({
      userId: groupMembers.userId,
      role: groupMembers.role,
      username: users.username,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId));

  return rows.map((r) => ({
    userId: r.userId,
    username: r.username,
    role: r.role,
  }));
}

async function assertMember(ctx: ApiContext, userId: string, groupId: string) {
  const [m] = await ctx.db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  if (!m) throw new ApiCoreError("Not a group member", 403, "NOT_MEMBER");
}

export async function sendGroupMessage(
  ctx: ApiContext,
  senderId: string,
  senderDeviceId: number,
  groupId: string,
  body: SendGroupMessageRequest
): Promise<{ messageId: string; createdAt: string }> {
  await requireVerifiedEmail(ctx, senderId);
  await assertMember(ctx, senderId, groupId);

  if (!body.ciphertext?.trim()) {
    throw new ApiCoreError("Message payload required", 400, "INVALID_MESSAGE");
  }
  if (body.ciphertext.length > MAX_CIPHERTEXT_CHARS) {
    throw new ApiCoreError("Message too large", 413, "MESSAGE_TOO_LARGE");
  }

  const [row] = await ctx.db
    .insert(groupMessages)
    .values({
      groupId,
      senderId,
      senderDeviceId,
      ciphertext: body.ciphertext,
      messageType: body.messageType,
    })
    .returning({ id: groupMessages.id, createdAt: groupMessages.createdAt });

  const envelope: GroupMessageEnvelope = {
    id: row.id,
    groupId,
    senderId,
    senderDeviceId,
    ciphertext: body.ciphertext,
    messageType: body.messageType,
    createdAt: row.createdAt.toISOString(),
  };

  await publishGroupMessage(ctx, groupId, envelope);

  const members = await ctx.db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));

  const { sendPushToUser } = await import("./push.js");
  for (const m of members) {
    if (m.userId !== senderId) {
      void sendPushToUser(ctx, m.userId, "VaultChat", "New group message");
    }
  }

  return { messageId: row.id, createdAt: row.createdAt.toISOString() };
}

export async function getGroupMessages(
  ctx: ApiContext,
  userId: string,
  groupId: string,
  cursor?: string,
  limit = 50
): Promise<GroupMessagesResponse> {
  await assertMember(ctx, userId, groupId);

  const pageSize = clampPageSize(limit);
  let cursorDate: Date | undefined;
  if (cursor) {
    cursorDate = new Date(cursor);
    if (Number.isNaN(cursorDate.getTime())) {
      throw new ApiCoreError("Invalid cursor", 400, "INVALID_CURSOR");
    }
  }

  const whereClause = cursorDate
    ? and(eq(groupMessages.groupId, groupId), lt(groupMessages.createdAt, cursorDate))
    : eq(groupMessages.groupId, groupId);

  const rows = await ctx.db
    .select()
    .from(groupMessages)
    .where(whereClause)
    .orderBy(desc(groupMessages.createdAt))
    .limit(pageSize);

  const messages: GroupMessageEnvelope[] = rows
    .map((row) => ({
      id: row.id,
      groupId: row.groupId,
      senderId: row.senderId,
      senderDeviceId: row.senderDeviceId,
      ciphertext: row.ciphertext,
      messageType: row.messageType as GroupMessageEnvelope["messageType"],
      createdAt: row.createdAt.toISOString(),
    }))
    .reverse();

  const nextCursor =
    rows.length === pageSize ? rows[rows.length - 1]?.createdAt.toISOString() : undefined;

  return {
    messages,
    cursor: rows.length === pageSize ? rows[rows.length - 1]?.createdAt.toISOString() : undefined,
    hasMore: rows.length === pageSize,
  };
}
