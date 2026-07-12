import { groupMembers, groups, users } from "@vaultchat/db";
import type { GroupInfo, GroupMemberInfo, UpdateCommunityRequest } from "@vaultchat/protocol";
import { and, eq } from "drizzle-orm";
import type { ApiContext } from "./context.js";
import { requireVerifiedEmail } from "./auth-users.js";
import { ApiCoreError } from "./errors.js";

const GROUP_NAME_RE = /^[a-zA-Z0-9 _-]{2,64}$/;

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

export async function updateCommunity(
  ctx: ApiContext,
  userId: string,
  communityId: string,
  body: UpdateCommunityRequest
): Promise<GroupInfo> {
  await requireVerifiedEmail(ctx, userId);
  await assertAdmin(ctx, userId, communityId);

  const updates: Partial<{ name: string; description: string | null }> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!GROUP_NAME_RE.test(name)) {
      throw new ApiCoreError("Invalid community name", 400, "INVALID_GROUP_NAME");
    }
    updates.name = name;
  }
  if (body.description !== undefined) {
    updates.description = body.description.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiCoreError("No updates provided", 400, "INVALID_REQUEST");
  }

  const [row] = await ctx.db
    .update(groups)
    .set(updates)
    .where(eq(groups.id, communityId))
    .returning();

  const members = await ctx.db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, communityId));

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    iconUrl: row.iconUrl ?? undefined,
    createdBy: row.createdBy,
    memberCount: members.length,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function addCommunityMember(
  ctx: ApiContext,
  adminId: string,
  communityId: string,
  username: string
): Promise<GroupMemberInfo> {
  await requireVerifiedEmail(ctx, adminId);
  await assertAdmin(ctx, adminId, communityId);

  const normalized = username.trim().toLowerCase();
  if (!normalized) {
    throw new ApiCoreError("Username required", 400, "INVALID_REQUEST");
  }

  const [user] = await ctx.db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, normalized))
    .limit(1);
  if (!user) throw new ApiCoreError("User not found", 404, "NOT_FOUND");
  if (user.id === adminId) {
    throw new ApiCoreError("You are already a member", 400, "INVALID_TARGET");
  }

  const [existing] = await ctx.db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, communityId), eq(groupMembers.userId, user.id)))
    .limit(1);
  if (existing) {
    throw new ApiCoreError("User is already a member", 409, "ALREADY_MEMBER");
  }

  await ctx.db.insert(groupMembers).values({
    groupId: communityId,
    userId: user.id,
    role: "member",
  });

  const members = await ctx.db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, communityId));

  const payload = JSON.stringify({
    type: "member_join",
    communityId,
    userId: user.id,
    username: user.username,
  });
  for (const m of members) {
    if (m.userId !== user.id) {
      await ctx.redis.publish(`vaultchat:user:${m.userId}`, payload);
    }
  }

  return { userId: user.id, username: user.username, role: "member" };
}

export async function kickCommunityMember(
  ctx: ApiContext,
  adminId: string,
  communityId: string,
  targetUserId: string
): Promise<{ ok: true }> {
  await assertAdmin(ctx, adminId, communityId);
  if (adminId === targetUserId) {
    throw new ApiCoreError("Cannot kick yourself", 400, "INVALID_TARGET");
  }

  const [target] = await ctx.db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, communityId), eq(groupMembers.userId, targetUserId)))
    .limit(1);
  if (!target) throw new ApiCoreError("Member not found", 404, "NOT_FOUND");
  if (target.role === "admin") {
    throw new ApiCoreError("Cannot kick an admin", 403, "NOT_ALLOWED");
  }

  await ctx.db
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, communityId), eq(groupMembers.userId, targetUserId)));

  await ctx.redis.publish(
    `vaultchat:user:${targetUserId}`,
    JSON.stringify({ type: "member_leave", communityId, userId: targetUserId })
  );

  return { ok: true };
}

export async function promoteCommunityMember(
  ctx: ApiContext,
  adminId: string,
  communityId: string,
  targetUserId: string
): Promise<{ ok: true }> {
  await assertAdmin(ctx, adminId, communityId);

  const [target] = await ctx.db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, communityId), eq(groupMembers.userId, targetUserId)))
    .limit(1);
  if (!target) throw new ApiCoreError("Member not found", 404, "NOT_FOUND");

  await ctx.db
    .update(groupMembers)
    .set({ role: "admin" })
    .where(and(eq(groupMembers.groupId, communityId), eq(groupMembers.userId, targetUserId)));

  return { ok: true };
}

export async function demoteCommunityMember(
  ctx: ApiContext,
  actorId: string,
  communityId: string,
  targetUserId: string
): Promise<{ ok: true }> {
  const [group] = await ctx.db
    .select({ createdBy: groups.createdBy })
    .from(groups)
    .where(eq(groups.id, communityId))
    .limit(1);
  if (!group) throw new ApiCoreError("Community not found", 404, "NOT_FOUND");
  if (group.createdBy !== actorId) {
    throw new ApiCoreError("Only the group creator can remove admin", 403, "NOT_OWNER");
  }
  if (actorId === targetUserId) {
    throw new ApiCoreError("Cannot remove your own admin role", 400, "INVALID_TARGET");
  }
  if (targetUserId === group.createdBy) {
    throw new ApiCoreError("Cannot remove the group creator's admin role", 403, "NOT_ALLOWED");
  }

  const [target] = await ctx.db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, communityId), eq(groupMembers.userId, targetUserId)))
    .limit(1);
  if (!target) throw new ApiCoreError("Member not found", 404, "NOT_FOUND");
  if (target.role !== "admin") {
    throw new ApiCoreError("User is not an admin", 400, "INVALID_TARGET");
  }

  await ctx.db
    .update(groupMembers)
    .set({ role: "member" })
    .where(and(eq(groupMembers.groupId, communityId), eq(groupMembers.userId, targetUserId)));

  return { ok: true };
}
