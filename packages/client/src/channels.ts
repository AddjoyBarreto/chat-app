import type {
  ChannelCategoryInfo,
  ChannelInfo,
  ChannelMessagesResponse,
  ChannelType,
  CreateCategoryRequest,
  CreateChannelRequest,
  PaginationOptions,
  SendChannelMessageRequest,
  VoicePresenceResponse,
} from "@vaultchat/protocol";
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

export async function fetchCommunityChannels(
  token: string,
  communityId: string
): Promise<{ channels: ChannelInfo[] }> {
  const res = await fetch(apiUrl(`/api/v1/communities/${communityId}/channels`), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function fetchChannelCategories(
  token: string,
  communityId: string
): Promise<{ categories: ChannelCategoryInfo[] }> {
  const res = await fetch(apiUrl(`/api/v1/communities/${communityId}/categories`), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function createCommunityChannel(
  token: string,
  communityId: string,
  body: CreateChannelRequest
): Promise<ChannelInfo> {
  const res = await fetch(apiUrl(`/api/v1/communities/${communityId}/channels`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function createChannelCategory(
  token: string,
  communityId: string,
  body: CreateCategoryRequest
): Promise<ChannelCategoryInfo> {
  const res = await fetch(apiUrl(`/api/v1/communities/${communityId}/categories`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function fetchChannelMessages(
  token: string,
  channelId: string,
  opts?: PaginationOptions
): Promise<ChannelMessagesResponse> {
  const res = await fetch(
    apiUrl(`/api/v1/channels/${channelId}/messages${paginationQuery(opts)}`),
    { headers: authHeaders(token) }
  );
  return parseApiResponse(res);
}

export async function sendChannelMessage(
  token: string,
  channelId: string,
  body: SendChannelMessageRequest
): Promise<{ messageId: string; createdAt: string }> {
  const res = await fetch(apiUrl(`/api/v1/channels/${channelId}/messages`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function joinVoiceChannel(
  token: string,
  channelId: string
): Promise<VoicePresenceResponse> {
  const res = await fetch(apiUrl(`/api/v1/channels/${channelId}/voice/join`), {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function leaveVoiceChannel(
  token: string,
  channelId: string
): Promise<VoicePresenceResponse> {
  const res = await fetch(apiUrl(`/api/v1/channels/${channelId}/voice/leave`), {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function fetchVoicePresence(
  token: string,
  channelId: string
): Promise<VoicePresenceResponse> {
  const res = await fetch(apiUrl(`/api/v1/channels/${channelId}/voice/presence`), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export type { ChannelType };
