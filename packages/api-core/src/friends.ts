import {
  blocks,
  friendRequests,
  friendships,
  userPrivacySettings,
  users,
} from "@vaultchat/db";
import type {
  BlockInfo,
  BlocksListResponse,
  DmPolicy,
  FriendInfo,
  FriendRequestInfo,
  FriendRequestsResponse,
  FriendsListResponse,
  PrivacySettingsResponse,
  UpdatePrivacyRequest,
} from "@vaultchat/protocol";
import { and, desc, eq, or } from "drizzle-orm";
import type { ApiContext } from "./context.js";
import { requireVerifiedEmail } from "./auth-users.js";
import { ApiCoreError } from "./errors.js";
import { MESSAGE_CHANNEL_PREFIX } from "./redis.js";

async function notifyFriendsChanged(ctx: ApiContext, userId: string): Promise<void> {
  await ctx.redis.publish(
    `${MESSAGE_CHANNEL_PREFIX}${userId}`,
    JSON.stringify({ type: "friends_changed" })
  );
}

export async function areFriends(
  ctx: ApiContext,
  userId: string,
  otherId: string
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ userId: friendships.userId })
    .from(friendships)
    .where(and(eq(friendships.userId, userId), eq(friendships.friendId, otherId)))
    .limit(1);
  return Boolean(row);
}

export async function isBlocked(
  ctx: ApiContext,
  blockerId: string,
  blockedId: string
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ userId: blocks.userId })
    .from(blocks)
    .where(and(eq(blocks.userId, blockerId), eq(blocks.blockedId, blockedId)))
    .limit(1);
  return Boolean(row);
}

export async function assertCanDm(
  ctx: ApiContext,
  senderId: string,
  recipientId: string
): Promise<void> {
  if (await isBlocked(ctx, recipientId, senderId)) {
    throw new ApiCoreError("You cannot message this user", 403, "BLOCKED");
  }
  if (await isBlocked(ctx, senderId, recipientId)) {
    throw new ApiCoreError("Unblock this user to send messages", 403, "YOU_BLOCKED");
  }

  const [privacy] = await ctx.db
    .select({ dmPolicy: userPrivacySettings.dmPolicy })
    .from(userPrivacySettings)
    .where(eq(userPrivacySettings.userId, recipientId))
    .limit(1);

  if (privacy?.dmPolicy === "friends_only") {
    const friends = await areFriends(ctx, senderId, recipientId);
    if (!friends) {
      throw new ApiCoreError(
        "This user only accepts DMs from friends",
        403,
        "DM_FRIENDS_ONLY"
      );
    }
  }
}

export async function listFriendIds(ctx: ApiContext, userId: string): Promise<string[]> {
  const rows = await ctx.db
    .select({ friendId: friendships.friendId })
    .from(friendships)
    .where(eq(friendships.userId, userId));
  return rows.map((r) => r.friendId);
}

export async function listFriends(
  ctx: ApiContext,
  userId: string
): Promise<FriendsListResponse> {
  const rows = await ctx.db
    .select({
      userId: friendships.friendId,
      username: users.username,
      since: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(users, eq(friendships.friendId, users.id))
    .where(eq(friendships.userId, userId))
    .orderBy(desc(friendships.createdAt));

  return {
    friends: rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      since: r.since.toISOString(),
    })),
  };
}

export async function listFriendRequests(
  ctx: ApiContext,
  userId: string
): Promise<FriendRequestsResponse> {
  const rows = await ctx.db
    .select({
      id: friendRequests.id,
      senderId: friendRequests.senderId,
      recipientId: friendRequests.recipientId,
      status: friendRequests.status,
      createdAt: friendRequests.createdAt,
      senderUsername: users.username,
    })
    .from(friendRequests)
    .innerJoin(users, eq(friendRequests.senderId, users.id))
    .where(
      and(
        eq(friendRequests.status, "pending"),
        or(eq(friendRequests.senderId, userId), eq(friendRequests.recipientId, userId))
      )
    )
    .orderBy(desc(friendRequests.createdAt));

  const recipientIds = [...new Set(rows.map((r) => r.recipientId))];
  const recipientUsers =
    recipientIds.length > 0
      ? await ctx.db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(or(...recipientIds.map((id) => eq(users.id, id))))
      : [];
  const recipientName = new Map(recipientUsers.map((u) => [u.id, u.username]));

  const incoming: FriendRequestInfo[] = [];
  const outgoing: FriendRequestInfo[] = [];

  for (const r of rows) {
    const info: FriendRequestInfo = {
      id: r.id,
      senderId: r.senderId,
      senderUsername: r.senderUsername,
      recipientId: r.recipientId,
      recipientUsername: recipientName.get(r.recipientId) ?? "unknown",
      status: r.status as FriendRequestInfo["status"],
      createdAt: r.createdAt.toISOString(),
    };
    if (r.recipientId === userId) incoming.push(info);
    else outgoing.push(info);
  }

  return { incoming, outgoing };
}

export async function sendFriendRequest(
  ctx: ApiContext,
  userId: string,
  targetUsername: string
): Promise<FriendRequestInfo> {
  await requireVerifiedEmail(ctx, userId);
  const username = targetUsername.trim().toLowerCase();

  const [target] = await ctx.db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!target) throw new ApiCoreError("User not found", 404, "NOT_FOUND");
  if (target.id === userId) {
    throw new ApiCoreError("You cannot friend yourself", 400, "INVALID_TARGET");
  }
  if (await isBlocked(ctx, target.id, userId)) {
    throw new ApiCoreError("Cannot send friend request", 403, "BLOCKED");
  }
  if (await areFriends(ctx, userId, target.id)) {
    throw new ApiCoreError("Already friends", 409, "ALREADY_FRIENDS");
  }

  const [existing] = await ctx.db
    .select()
    .from(friendRequests)
    .where(
      or(
        and(eq(friendRequests.senderId, userId), eq(friendRequests.recipientId, target.id)),
        and(eq(friendRequests.senderId, target.id), eq(friendRequests.recipientId, userId))
      )
    )
    .limit(1);

  if (existing?.status === "pending") {
    throw new ApiCoreError("Friend request already pending", 409, "REQUEST_PENDING");
  }

  const [me] = await ctx.db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [row] = await ctx.db
    .insert(friendRequests)
    .values({ senderId: userId, recipientId: target.id, status: "pending" })
    .onConflictDoUpdate({
      target: [friendRequests.senderId, friendRequests.recipientId],
      set: { status: "pending", createdAt: new Date() },
    })
    .returning();

  const result: FriendRequestInfo = {
    id: row.id,
    senderId: userId,
    senderUsername: me?.username ?? "unknown",
    recipientId: target.id,
    recipientUsername: target.username,
    status: "pending",
    createdAt: row.createdAt.toISOString(),
  };

  await ctx.redis.publish(
    `vaultchat:user:${target.id}`,
    JSON.stringify({ type: "friend_request", request: result })
  );

  return result;
}

async function addFriendshipPair(
  ctx: ApiContext,
  userId: string,
  friendId: string
): Promise<void> {
  await ctx.db
    .insert(friendships)
    .values([
      { userId, friendId },
      { userId: friendId, friendId: userId },
    ])
    .onConflictDoNothing();
}

export async function acceptFriendRequest(
  ctx: ApiContext,
  userId: string,
  requestId: string
): Promise<FriendInfo> {
  await requireVerifiedEmail(ctx, userId);

  const [req] = await ctx.db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.recipientId, userId)))
    .limit(1);
  if (!req || req.status !== "pending") {
    throw new ApiCoreError("Friend request not found", 404, "NOT_FOUND");
  }

  await ctx.db
    .update(friendRequests)
    .set({ status: "accepted" })
    .where(eq(friendRequests.id, requestId));

  await addFriendshipPair(ctx, userId, req.senderId);

  const [sender] = await ctx.db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, req.senderId))
    .limit(1);

  const [me] = await ctx.db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const friend: FriendInfo = {
    userId: req.senderId,
    username: sender?.username ?? "unknown",
    since: new Date().toISOString(),
  };

  await ctx.redis.publish(
    `vaultchat:user:${req.senderId}`,
    JSON.stringify({
      type: "friend_accept",
      friend: {
        userId,
        username: me?.username ?? "unknown",
        since: friend.since,
      },
    })
  );

  await notifyFriendsChanged(ctx, userId);

  return friend;
}

export async function rejectFriendRequest(
  ctx: ApiContext,
  userId: string,
  requestId: string
): Promise<{ ok: true }> {
  const [req] = await ctx.db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.recipientId, userId)))
    .limit(1);
  if (!req) throw new ApiCoreError("Friend request not found", 404, "NOT_FOUND");

  await ctx.db
    .update(friendRequests)
    .set({ status: "rejected" })
    .where(eq(friendRequests.id, requestId));

  await notifyFriendsChanged(ctx, userId);

  return { ok: true };
}

export async function removeFriend(
  ctx: ApiContext,
  userId: string,
  friendId: string
): Promise<{ ok: true }> {
  await ctx.db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
        and(eq(friendships.userId, friendId), eq(friendships.friendId, userId))
      )
    );
  return { ok: true };
}

export async function blockUser(
  ctx: ApiContext,
  userId: string,
  targetUsername: string
): Promise<BlockInfo> {
  const username = targetUsername.trim().toLowerCase();
  const [target] = await ctx.db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!target) throw new ApiCoreError("User not found", 404, "NOT_FOUND");
  if (target.id === userId) {
    throw new ApiCoreError("You cannot block yourself", 400, "INVALID_TARGET");
  }

  await removeFriend(ctx, userId, target.id);

  const [row] = await ctx.db
    .insert(blocks)
    .values({ userId, blockedId: target.id })
    .onConflictDoNothing()
    .returning();

  return {
    userId: target.id,
    username: target.username,
    blockedAt: (row?.createdAt ?? new Date()).toISOString(),
  };
}

export async function unblockUser(
  ctx: ApiContext,
  userId: string,
  blockedId: string
): Promise<{ ok: true }> {
  await ctx.db
    .delete(blocks)
    .where(and(eq(blocks.userId, userId), eq(blocks.blockedId, blockedId)));
  return { ok: true };
}

export async function listBlocks(
  ctx: ApiContext,
  userId: string
): Promise<BlocksListResponse> {
  const rows = await ctx.db
    .select({
      userId: blocks.blockedId,
      username: users.username,
      blockedAt: blocks.createdAt,
    })
    .from(blocks)
    .innerJoin(users, eq(blocks.blockedId, users.id))
    .where(eq(blocks.userId, userId));

  return {
    blocks: rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      blockedAt: r.blockedAt.toISOString(),
    })),
  };
}

export async function getPrivacySettings(
  ctx: ApiContext,
  userId: string
): Promise<PrivacySettingsResponse> {
  const [row] = await ctx.db
    .select({ dmPolicy: userPrivacySettings.dmPolicy })
    .from(userPrivacySettings)
    .where(eq(userPrivacySettings.userId, userId))
    .limit(1);

  return { dmPolicy: (row?.dmPolicy ?? "everyone") as DmPolicy };
}

export async function updatePrivacySettings(
  ctx: ApiContext,
  userId: string,
  body: UpdatePrivacyRequest
): Promise<PrivacySettingsResponse> {
  if (body.dmPolicy !== "everyone" && body.dmPolicy !== "friends_only") {
    throw new ApiCoreError("Invalid DM policy", 400, "INVALID_POLICY");
  }

  await ctx.db
    .insert(userPrivacySettings)
    .values({ userId, dmPolicy: body.dmPolicy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userPrivacySettings.userId,
      set: { dmPolicy: body.dmPolicy, updatedAt: new Date() },
    });

  return { dmPolicy: body.dmPolicy };
}
