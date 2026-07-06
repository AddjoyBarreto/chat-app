import type { ApiError } from "@vaultchat/protocol";
import { isApiCoreError } from "./errors.js";

export function toApiError(err: unknown): { body: ApiError; status: number } {
  if (isApiCoreError(err)) {
    return { body: { error: err.message, code: err.code }, status: err.status };
  }
  console.error(err);
  return { body: { error: "Internal server error" }, status: 500 };
}
