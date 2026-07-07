import { conversationReadState } from "@vaultchat/db";
import type { DmReadStateResponse, UpdateDmReadStateRequest } from "@vaultchat/protocol";
import { and, eq } from "drizzle-orm";
import type { ApiContext } from "./context.js";
import { ApiCoreError } from "./errors.js";

export async function getDmReadState(
  ctx: ApiContext,
  userId: string
): Promise<DmReadStateResponse> {
  const rows = await ctx.db
    .select({
      peerId: conversationReadState.peerId,
      lastReadAt: conversationReadState.lastReadAt,
    })
    .from(conversationReadState)
    .where(eq(conversationReadState.userId, userId));

  const readState: Record<string, string> = {};
  for (const row of rows) {
    readState[row.peerId] = row.lastReadAt.toISOString();
  }
  return { readState };
}

export async function setDmReadState(
  ctx: ApiContext,
  userId: string,
  peerId: string,
  body: UpdateDmReadStateRequest
): Promise<{ ok: true }> {
  const lastReadAt = new Date(body.lastReadAt);
  if (Number.isNaN(lastReadAt.getTime())) {
    throw new ApiCoreError("Invalid lastReadAt", 400, "INVALID_READ_STATE");
  }

  const [existing] = await ctx.db
    .select({ lastReadAt: conversationReadState.lastReadAt })
    .from(conversationReadState)
    .where(and(eq(conversationReadState.userId, userId), eq(conversationReadState.peerId, peerId)))
    .limit(1);

  if (existing && existing.lastReadAt >= lastReadAt) {
    return { ok: true };
  }

  await ctx.db
    .insert(conversationReadState)
    .values({ userId, peerId, lastReadAt })
    .onConflictDoUpdate({
      target: [conversationReadState.userId, conversationReadState.peerId],
      set: { lastReadAt },
    });

  return { ok: true };
}
