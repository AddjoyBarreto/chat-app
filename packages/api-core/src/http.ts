import type { ApiError } from "@vaultchat/protocol";
import { isApiCoreError } from "./errors.js";

function isPostgresCapacityError(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } })?.cause;
  if (cause?.code === "53300") return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("too many clients already");
}

export function toApiError(err: unknown): { body: ApiError; status: number } {
  if (isApiCoreError(err)) {
    return { body: { error: err.message, code: err.code }, status: err.status };
  }

  if (isPostgresCapacityError(err)) {
    return {
      body: {
        error: "Database is temporarily busy. Wait a moment and try again.",
        code: "DB_BUSY",
      },
      status: 503,
    };
  }

  console.error(err);
  return { body: { error: "Internal server error" }, status: 500 };
}
