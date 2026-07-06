import { randomBytes } from "node:crypto";
import { groupMembers, groups, invites, users } from "@vaultchat/db";
import type {
  CreateInviteRequest,
  InviteInfo,
  RedeemInviteResponse,
} from "@vaultchat/protocol";
import { and, desc, eq } from "drizzle-orm";
import type { ApiContext } from "./context.js";
import { requireVerifiedEmail } from "./auth-users.js";
import { ApiCoreError } from "./errors.js";

function generateInviteCode(): string {
  return randomBytes(6).toString("base64url").slice(0, 8).toLowerCase();
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

export async function createInvite(
  ctx: ApiContext,
  userId: string,
  communityId: string,
  body: CreateInviteRequest
): Promise<InviteInfo> {
  await requireVerifiedEmail(ctx, userId);
  await assertAdmin(ctx, userId, communityId);

  const [community] = await ctx.db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(eq(groups.id, communityId))
    .limit(1);
  if (!community) throw new ApiCoreError("Community not found", 404, "NOT_FOUND");

  const expiresAt =
    body.expiresInHours && body.expiresInHours > 0
      ? new Date(Date.now() + body.expiresInHours * 3600_000)
      : undefined;

  const [row] = await ctx.db
    .insert(invites)
    .values({
      code: generateInviteCode(),
      communityId,
      createdBy: userId,
      maxUses: body.maxUses,
      expiresAt,
    })
    .returning();

  return {
    id: row.id,
    code: row.code,
    communityId: row.communityId,
    communityName: community.name,
    maxUses: row.maxUses ?? undefined,
    useCount: row.useCount,
    expiresAt: row.expiresAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCommunityInvites(
  ctx: ApiContext,
  userId: string,
  communityId: string
): Promise<{ invites: InviteInfo[] }> {
  await assertAdmin(ctx, userId, communityId);

  const [community] = await ctx.db
    .select({ name: groups.name })
    .from(groups)
    .where(eq(groups.id, communityId))
    .limit(1);

  const rows = await ctx.db
    .select()
    .from(invites)
    .where(eq(invites.communityId, communityId))
    .orderBy(desc(invites.createdAt));

  return {
    invites: rows.map((row) => ({
      id: row.id,
      code: row.code,
      communityId: row.communityId,
      communityName: community?.name ?? "Community",
      maxUses: row.maxUses ?? undefined,
      useCount: row.useCount,
      expiresAt: row.expiresAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function redeemInvite(
  ctx: ApiContext,
  userId: string,
  code: string
): Promise<RedeemInviteResponse> {
  await requireVerifiedEmail(ctx, userId);
  const normalized = code.trim().toLowerCase();

  const [invite] = await ctx.db
    .select()
    .from(invites)
    .where(eq(invites.code, normalized))
    .limit(1);
  if (!invite) throw new ApiCoreError("Invalid invite code", 404, "NOT_FOUND");
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new ApiCoreError("Invite expired", 410, "INVITE_EXPIRED");
  }
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
    throw new ApiCoreError("Invite has reached max uses", 410, "INVITE_EXHAUSTED");
  }

  const [community] = await ctx.db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(eq(groups.id, invite.communityId))
    .limit(1);
  if (!community) throw new ApiCoreError("Community not found", 404, "NOT_FOUND");

  const [existing] = await ctx.db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, community.id), eq(groupMembers.userId, userId)))
    .limit(1);

  if (!existing) {
    await ctx.db.insert(groupMembers).values({
      groupId: community.id,
      userId,
      role: "member",
    });

    const [me] = await ctx.db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const members = await ctx.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, community.id));

    const payload = JSON.stringify({
      type: "member_join",
      communityId: community.id,
      userId,
      username: me?.username ?? "unknown",
    });
    for (const m of members) {
      if (m.userId !== userId) {
        await ctx.redis.publish(`vaultchat:user:${m.userId}`, payload);
      }
    }
  }

  await ctx.db
    .update(invites)
    .set({ useCount: invite.useCount + 1 })
    .where(eq(invites.id, invite.id));

  return { communityId: community.id, communityName: community.name };
}
