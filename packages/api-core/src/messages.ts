import { conversations, messages, users } from "@vaultchat/db";
import type {
  ConversationPreview,
  ConversationResponse,
  ConversationsResponse,
  InboxResponse,
  MessageEnvelope,
  SendMessageRequest,
  SendMessageResponse,
} from "@vaultchat/protocol";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { ApiContext } from "./context.js";
import { requireVerifiedEmail } from "./auth-users.js";
import { assertCanDm } from "./friends.js";
import { ApiCoreError } from "./errors.js";
import { clampPageSize } from "./pagination.js";
import { publishMessage } from "./redis.js";

const MAX_CIPHERTEXT_CHARS = 131_072;

function parseSenderCiphertexts(raw: string | null | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return undefined;
  }
}

function toEnvelope(row: typeof messages.$inferSelect): MessageEnvelope {
  return {
    id: row.id,
    senderId: row.senderId,
    senderDeviceId: row.senderDeviceId,
    recipientId: row.recipientId,
    ciphertext: row.ciphertext,
    messageType: row.messageType as MessageEnvelope["messageType"],
    attachmentMeta: row.attachmentMeta ?? undefined,
    senderCiphertexts: parseSenderCiphertexts(row.senderCiphertexts),
    createdAt: row.createdAt.toISOString(),
  };
}

function parseCursorDate(cursor?: string): Date | undefined {
  if (!cursor) return undefined;
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiCoreError("Invalid cursor", 400, "INVALID_CURSOR");
  }
  return parsed;
}

function assertValidCiphertext(ciphertext: string): void {
  if (!ciphertext?.trim()) {
    throw new ApiCoreError("Message payload required", 400, "INVALID_MESSAGE");
  }
  if (ciphertext.length > MAX_CIPHERTEXT_CHARS) {
    throw new ApiCoreError("Message too large", 413, "MESSAGE_TOO_LARGE");
  }
}

async function touchConversations(
  ctx: ApiContext,
  senderId: string,
  recipientId: string,
  messageId: string,
  lastMessageAt: Date
): Promise<void> {
  const rows = [
    { userId: senderId, peerId: recipientId, lastMessageId: messageId, lastMessageAt },
    { userId: recipientId, peerId: senderId, lastMessageId: messageId, lastMessageAt },
  ];

  for (const row of rows) {
    await ctx.db
      .insert(conversations)
      .values(row)
      .onConflictDoUpdate({
        target: [conversations.userId, conversations.peerId],
        set: {
          lastMessageId: row.lastMessageId,
          lastMessageAt: row.lastMessageAt,
        },
      });
  }
}

export async function sendMessage(
  ctx: ApiContext,
  senderId: string,
  senderDeviceId: number,
  body: SendMessageRequest
): Promise<SendMessageResponse> {
  await requireVerifiedEmail(ctx, senderId);
  assertValidCiphertext(body.ciphertext);

  if (senderId === body.recipientId) {
    throw new ApiCoreError("Cannot message yourself", 400, "INVALID_RECIPIENT");
  }

  const [recipient] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, body.recipientId))
    .limit(1);
  if (!recipient) throw new ApiCoreError("Recipient not found", 404, "NOT_FOUND");

  await assertCanDm(ctx, senderId, body.recipientId);

  const [row] = await ctx.db
    .insert(messages)
    .values({
      senderId,
      senderDeviceId,
      recipientId: body.recipientId,
      ciphertext: body.ciphertext,
      senderCiphertexts: body.senderCiphertexts
        ? JSON.stringify(body.senderCiphertexts)
        : undefined,
      messageType: body.messageType,
      attachmentMeta: body.attachmentMeta,
    })
    .returning({ id: messages.id, createdAt: messages.createdAt });

  await touchConversations(ctx, senderId, body.recipientId, row.id, row.createdAt);

  const envelope: MessageEnvelope = {
    id: row.id,
    senderId,
    senderDeviceId,
    recipientId: body.recipientId,
    ciphertext: body.ciphertext,
    messageType: body.messageType,
    attachmentMeta: body.attachmentMeta,
    senderCiphertexts: body.senderCiphertexts,
    createdAt: row.createdAt.toISOString(),
  };

  await publishMessage(ctx.redis, envelope);

  const { sendPushToUser } = await import("./push.js");
  void sendPushToUser(ctx, body.recipientId);

  return { messageId: row.id, createdAt: row.createdAt.toISOString() };
}

export async function getInbox(
  ctx: ApiContext,
  userId: string,
  cursor?: string,
  limit = 50
): Promise<InboxResponse> {
  const pageSize = clampPageSize(limit);
  const cursorDate = parseCursorDate(cursor);

  const whereClause = cursorDate
    ? and(eq(messages.recipientId, userId), lt(messages.createdAt, cursorDate))
    : eq(messages.recipientId, userId);

  const rows = await ctx.db
    .select()
    .from(messages)
    .where(whereClause)
    .orderBy(desc(messages.createdAt))
    .limit(pageSize);

  const result = rows.map(toEnvelope);
  const nextCursor =
    result.length === pageSize ? result[result.length - 1]?.createdAt : undefined;

  return { messages: result, cursor: nextCursor, hasMore: result.length === pageSize };
}

export async function getConversation(
  ctx: ApiContext,
  userId: string,
  peerId: string,
  cursor?: string,
  limit = 50
): Promise<ConversationResponse> {
  if (userId === peerId) {
    throw new ApiCoreError("Cannot open conversation with yourself", 400, "INVALID_PEER");
  }

  const [peer] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, peerId))
    .limit(1);
  if (!peer) throw new ApiCoreError("User not found", 404, "NOT_FOUND");

  const pageSize = clampPageSize(limit);
  const cursorDate = parseCursorDate(cursor);

  const threadFilter = or(
    and(eq(messages.senderId, userId), eq(messages.recipientId, peerId)),
    and(eq(messages.senderId, peerId), eq(messages.recipientId, userId))
  );

  const whereClause = cursorDate
    ? and(threadFilter, lt(messages.createdAt, cursorDate))
    : threadFilter;

  const rows = await ctx.db
    .select()
    .from(messages)
    .where(whereClause)
    .orderBy(desc(messages.createdAt))
    .limit(pageSize);

  const result = rows.map(toEnvelope).reverse();
  const nextCursor =
    rows.length === pageSize ? rows[rows.length - 1]?.createdAt.toISOString() : undefined;

  return { peerId, messages: result, cursor: nextCursor, hasMore: rows.length === pageSize };
}

export async function listConversations(
  ctx: ApiContext,
  userId: string
): Promise<ConversationsResponse> {
  const rows = await ctx.db
    .select({
      peerId: conversations.peerId,
      peerUsername: users.username,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .innerJoin(users, eq(conversations.peerId, users.id))
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.lastMessageAt));

  const conversationsList: ConversationPreview[] = rows.map((row) => ({
    peerId: row.peerId,
    peerUsername: row.peerUsername,
    lastMessageAt: row.lastMessageAt.toISOString(),
  }));

  return { conversations: conversationsList };
}
