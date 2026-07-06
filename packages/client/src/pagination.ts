import type { PaginationOptions } from "@vaultchat/protocol";
import { getClientConfig } from "./config.js";
import { parseApiResponse } from "./errors.js";

function apiUrl(path: string) {
  return `${getClientConfig().apiBaseUrl}${path}`;
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function paginationQuery(opts?: PaginationOptions): string {
  const params = new URLSearchParams();
  if (opts?.cursor) params.set("cursor", opts.cursor);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  return q ? `?${q}` : "";
}

export async function fetchConversation(
  token: string,
  peerId: string,
  opts?: PaginationOptions
) {
  const res = await fetch(
    apiUrl(`/api/v1/conversations/${peerId}${paginationQuery(opts)}`),
    { headers: authHeaders(token) }
  );
  return parseApiResponse(res);
}

export async function fetchGroupMessages(
  token: string,
  groupId: string,
  opts?: PaginationOptions
) {
  const res = await fetch(
    apiUrl(`/api/v1/groups/${groupId}/messages${paginationQuery(opts)}`),
    { headers: authHeaders(token) }
  );
  return parseApiResponse(res);
}
