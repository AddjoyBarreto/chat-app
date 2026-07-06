import Redis from "ioredis";
import type { ChannelMessageEnvelope, GroupMessageEnvelope, MessageEnvelope } from "@vaultchat/protocol";
import type { ApiContext } from "./context.js";

export const MESSAGE_CHANNEL_PREFIX = "vaultchat:user:";
export const GROUP_CHANNEL_PREFIX = "vaultchat:group:";
export const CHANNEL_CHANNEL_PREFIX = "vaultchat:channel:";

export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
}

export async function publishMessage(redis: Redis, envelope: MessageEnvelope): Promise<void> {
  const payload = JSON.stringify({ type: "message", envelope });
  await redis.publish(`${MESSAGE_CHANNEL_PREFIX}${envelope.recipientId}`, payload);
  if (envelope.senderId !== envelope.recipientId) {
    await redis.publish(`${MESSAGE_CHANNEL_PREFIX}${envelope.senderId}`, payload);
  }
}

export async function publishGroupMessage(
  ctx: ApiContext,
  groupId: string,
  envelope: GroupMessageEnvelope
): Promise<void> {
  const { groupMembers } = await import("@vaultchat/db");
  const { eq } = await import("drizzle-orm");

  const members = await ctx.db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));

  const payload = JSON.stringify({ type: "group_message", envelope });
  for (const m of members) {
    await ctx.redis.publish(`${MESSAGE_CHANNEL_PREFIX}${m.userId}`, payload);
  }
}

export async function publishChannelMessage(
  ctx: ApiContext,
  channelId: string,
  envelope: ChannelMessageEnvelope
): Promise<void> {
  const { channels, groupMembers } = await import("@vaultchat/db");
  const { eq } = await import("drizzle-orm");

  const [channel] = await ctx.db
    .select({ communityId: channels.communityId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) return;

  const members = await ctx.db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, channel.communityId));

  const payload = JSON.stringify({ type: "channel_message", envelope });
  for (const m of members) {
    await ctx.redis.publish(`${MESSAGE_CHANNEL_PREFIX}${m.userId}`, payload);
  }
  await ctx.redis.publish(`${CHANNEL_CHANNEL_PREFIX}${channelId}`, payload);
}
