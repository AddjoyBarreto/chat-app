import { pushTokens } from "@vaultchat/db";
import type { RegisterPushTokenRequest } from "@vaultchat/protocol";
import { eq } from "drizzle-orm";
import type { ApiContext } from "./context.js";

export async function registerPushToken(
  ctx: ApiContext,
  userId: string,
  body: RegisterPushTokenRequest
): Promise<{ ok: true }> {
  await ctx.db
    .delete(pushTokens)
    .where(eq(pushTokens.token, body.pushToken));

  await ctx.db.insert(pushTokens).values({
    userId,
    token: body.pushToken,
    platform: body.platform,
  });

  return { ok: true };
}

export async function sendPushToUser(
  ctx: ApiContext,
  userId: string,
  title = "VaultChat",
  body = "You have a new encrypted message",
  data: Record<string, string> = { type: "new_message" }
): Promise<void> {
  // Never throw — callers often fire-and-forget with `void`, and an unhandled
  // rejection can crash the Vercel isolate (FUNCTION_INVOCATION_FAILED).
  try {
    const tokens = await ctx.db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.userId, userId));

    if (tokens.length === 0) return;

    const messages = tokens.map((t) => ({
      to: t.token,
      sound: "default" as const,
      title,
      body,
      data,
    }));

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error("Push notification failed:", err);
  }
}
