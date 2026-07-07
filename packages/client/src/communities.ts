import type {
  AddCommunityMemberRequest,
  CreateInviteRequest,
  GroupInfo,
  GroupMemberInfo,
  InviteInfo,
  UpdateCommunityRequest,
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

export async function updateCommunity(
  token: string,
  communityId: string,
  body: UpdateCommunityRequest
): Promise<GroupInfo> {
  const res = await clientFetch(apiUrl(`/api/v1/communities/${communityId}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function listCommunityInvites(
  token: string,
  communityId: string
): Promise<InviteInfo[]> {
  const res = await clientFetch(apiUrl(`/api/v1/communities/${communityId}/invites`), {
    headers: authHeaders(token),
  });
  const data = await parseApiResponse<{ invites: InviteInfo[] }>(res);
  return data.invites;
}

export async function createCommunityInvite(
  token: string,
  communityId: string,
  body: CreateInviteRequest = {}
): Promise<InviteInfo> {
  const res = await clientFetch(apiUrl(`/api/v1/communities/${communityId}/invites`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function addCommunityMember(
  token: string,
  communityId: string,
  body: AddCommunityMemberRequest
): Promise<GroupMemberInfo> {
  const res = await clientFetch(apiUrl(`/api/v1/communities/${communityId}/members`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseApiResponse<{ member: GroupMemberInfo }>(res);
  return data.member;
}

export async function kickCommunityMember(
  token: string,
  communityId: string,
  userId: string
): Promise<void> {
  const res = await clientFetch(apiUrl(`/api/v1/communities/${communityId}/members/${userId}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
  await parseApiResponse(res);
}

export async function promoteCommunityMember(
  token: string,
  communityId: string,
  userId: string
): Promise<void> {
  const res = await clientFetch(
    apiUrl(`/api/v1/communities/${communityId}/members/${userId}/promote`),
    {
      method: "POST",
      headers: authHeaders(token),
    }
  );
  await parseApiResponse(res);
}
