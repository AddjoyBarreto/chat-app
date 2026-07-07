import type {
  BlockInfo,
  BlocksListResponse,
  CreateInviteRequest,
  DmPolicy,
  FriendInfo,
  FriendRequestInfo,
  FriendRequestsResponse,
  FriendsListResponse,
  InviteInfo,
  PrivacySettingsResponse,
  RedeemInviteResponse,
  UpdatePrivacyRequest,
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

export async function fetchFriends(token: string): Promise<FriendsListResponse> {
  const res = await clientFetch(apiUrl("/api/v1/friends"), { headers: authHeaders(token) });
  return parseApiResponse(res);
}

export async function fetchFriendRequests(token: string): Promise<FriendRequestsResponse> {
  const res = await clientFetch(apiUrl("/api/v1/friends/requests"), { headers: authHeaders(token) });
  return parseApiResponse(res);
}

export async function sendFriendRequest(
  token: string,
  username: string
): Promise<FriendRequestInfo> {
  const res = await clientFetch(apiUrl("/api/v1/friends/request"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ username }),
  });
  return parseApiResponse(res);
}

export async function acceptFriendRequest(
  token: string,
  requestId: string
): Promise<FriendInfo> {
  const res = await clientFetch(apiUrl(`/api/v1/friends/requests/${requestId}/accept`), {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function rejectFriendRequest(
  token: string,
  requestId: string
): Promise<{ ok: true }> {
  const res = await clientFetch(apiUrl(`/api/v1/friends/requests/${requestId}/reject`), {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function removeFriend(token: string, friendId: string): Promise<{ ok: true }> {
  const res = await clientFetch(apiUrl(`/api/v1/friends/${friendId}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function blockUser(token: string, username: string): Promise<BlockInfo> {
  const res = await clientFetch(apiUrl("/api/v1/blocks"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ username }),
  });
  return parseApiResponse(res);
}

export async function fetchBlocks(token: string): Promise<BlocksListResponse> {
  const res = await clientFetch(apiUrl("/api/v1/blocks"), { headers: authHeaders(token) });
  return parseApiResponse(res);
}

export async function unblockUser(token: string, userId: string): Promise<{ ok: true }> {
  const res = await clientFetch(apiUrl(`/api/v1/blocks/${userId}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function fetchPrivacySettings(token: string): Promise<PrivacySettingsResponse> {
  const res = await clientFetch(apiUrl("/api/v1/privacy"), { headers: authHeaders(token) });
  return parseApiResponse(res);
}

export async function updatePrivacySettings(
  token: string,
  body: UpdatePrivacyRequest
): Promise<PrivacySettingsResponse> {
  const res = await clientFetch(apiUrl("/api/v1/privacy"), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
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

export async function redeemInvite(token: string, code: string): Promise<RedeemInviteResponse> {
  const res = await clientFetch(apiUrl("/api/v1/invites/redeem"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ code }),
  });
  return parseApiResponse(res);
}

export type { DmPolicy };
