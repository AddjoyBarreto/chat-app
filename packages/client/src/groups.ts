import type {
  CreateGroupRequest,
  GroupInfo,
  GroupMemberInfo,
  GroupMessageEnvelope,
  GroupMessagesResponse,
  SendGroupMessageRequest,
} from "@vaultchat/protocol";
import { getClientConfig } from "./config.js";
import { clientFetch } from "./http.js";
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

export async function createGroup(
  token: string,
  body: CreateGroupRequest
): Promise<GroupInfo> {
  const res = await clientFetch(apiUrl("/api/v1/groups"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function fetchGroups(token: string): Promise<GroupInfo[]> {
  const res = await clientFetch(apiUrl("/api/v1/groups"), {
    headers: authHeaders(token),
  });
  const data = await parseApiResponse<{ groups: GroupInfo[] }>(res);
  return data.groups;
}

export async function fetchGroupMembers(
  token: string,
  groupId: string
): Promise<GroupMemberInfo[]> {
  const res = await clientFetch(apiUrl(`/api/v1/groups/${groupId}/members`), {
    headers: authHeaders(token),
  });
  const data = await parseApiResponse<{ members: GroupMemberInfo[] }>(res);
  return data.members;
}

export async function sendGroupMessage(
  token: string,
  groupId: string,
  body: SendGroupMessageRequest
): Promise<{ messageId: string; createdAt: string }> {
  const res = await clientFetch(apiUrl(`/api/v1/groups/${groupId}/messages`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function fetchGroupMessages(
  token: string,
  groupId: string,
  opts?: import("@vaultchat/protocol").PaginationOptions
): Promise<GroupMessagesResponse> {
  const params = new URLSearchParams();
  if (opts?.cursor) params.set("cursor", opts.cursor);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  const res = await clientFetch(apiUrl(`/api/v1/groups/${groupId}/messages${q ? `?${q}` : ""}`), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export type { GroupMessageEnvelope };
