import { accountKeyBackups } from "@vaultchat/db";
import type { AccountKeyBackupResponse, PutAccountKeyBackupRequest } from "@vaultchat/protocol";
import { eq } from "drizzle-orm";
import type { ApiContext } from "./context.js";
import { ApiCoreError } from "./errors.js";

const MAX_BACKUP_CHARS = 2_000_000;

export async function getAccountKeyBackup(
  ctx: ApiContext,
  userId: string
): Promise<AccountKeyBackupResponse> {
  const [row] = await ctx.db
    .select({ encryptedBlob: accountKeyBackups.encryptedBlob })
    .from(accountKeyBackups)
    .where(eq(accountKeyBackups.userId, userId))
    .limit(1);

  return { backup: row?.encryptedBlob ?? null };
}

export async function putAccountKeyBackup(
  ctx: ApiContext,
  userId: string,
  body: PutAccountKeyBackupRequest
): Promise<{ ok: true }> {
  const backup = body.backup?.trim();
  if (!backup) {
    throw new ApiCoreError("Backup payload required", 400, "INVALID_BACKUP");
  }
  if (backup.length > MAX_BACKUP_CHARS) {
    throw new ApiCoreError("Backup too large", 413, "BACKUP_TOO_LARGE");
  }

  await ctx.db
    .insert(accountKeyBackups)
    .values({ userId, encryptedBlob: backup })
    .onConflictDoUpdate({
      target: accountKeyBackups.userId,
      set: { encryptedBlob: backup, updatedAt: new Date() },
    });

  return { ok: true };
}
