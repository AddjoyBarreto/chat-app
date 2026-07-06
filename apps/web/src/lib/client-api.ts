import type { EncryptedPayload } from "@vaultchat/crypto";
import type {
  ConversationResponse,
  ConversationsResponse,
  InboxResponse,
  LoginUserRequest,
  LoginUserResponse,
  MeResponse,
  MessageEnvelope,
  PreKeyBundleResponse,
  RegisterUserResponse,
  ResendVerificationResponse,
  SendMessageResponse,
  UserProfile,
  VerifyEmailResponse,
} from "@vaultchat/protocol";
import { parseApiResponse } from "./errors";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function registerOnServer(body: {
  username: string;
  email: string;
  password: string;
  phoneCountryCode: string;
  phoneNumber: string;
  identityKeyPublic: string;
  registrationId: number;
  deviceName?: string;
}): Promise<RegisterUserResponse> {
  const res = await fetch(`${API}/api/v1/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function loginOnServer(body: LoginUserRequest): Promise<LoginUserResponse> {
  const res = await fetch(`${API}/api/v1/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function fetchMe(token: string): Promise<MeResponse> {
  const res = await fetch(`${API}/api/v1/users/me`, {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function verifyEmailOnServer(token: string): Promise<VerifyEmailResponse> {
  const res = await fetch(`${API}/api/v1/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return parseApiResponse(res);
}

export async function resendVerificationEmail(token: string): Promise<ResendVerificationResponse> {
  const res = await fetch(`${API}/api/v1/auth/resend-verification`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function uploadPreKeys(
  token: string,
  body: import("@vaultchat/protocol").UploadPreKeysRequest
): Promise<void> {
  const res = await fetch(`${API}/api/v1/keys`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  await parseApiResponse(res);
}

export async function lookupUser(username: string): Promise<UserProfile> {
  const res = await fetch(`${API}/api/v1/users/${encodeURIComponent(username)}`);
  return parseApiResponse(res);
}

export async function fetchPreKeyBundle(
  userId: string,
  deviceId = 1
): Promise<PreKeyBundleResponse> {
  const params = deviceId !== 1 ? `?deviceId=${deviceId}` : "";
  const res = await fetch(`${API}/api/v1/keys/${userId}${params}`);
  return parseApiResponse(res);
}

export async function sendEncryptedMessage(
  token: string,
  recipientId: string,
  payload: EncryptedPayload,
  messageType: import("@vaultchat/protocol").MessageType = "text",
  attachmentMeta?: string,
  recipientDeviceId = 1,
  senderCiphertexts?: Record<string, string>
): Promise<SendMessageResponse> {
  const res = await fetch(`${API}/api/v1/messages`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      recipientId,
      recipientDeviceId,
      ciphertext: JSON.stringify(payload),
      messageType,
      attachmentMeta,
      senderCiphertexts,
    }),
  });
  return parseApiResponse(res);
}

export async function fetchInbox(token: string): Promise<InboxResponse> {
  const res = await fetch(`${API}/api/v1/messages`, {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function fetchConversations(token: string): Promise<ConversationsResponse> {
  const res = await fetch(`${API}/api/v1/conversations`, {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function fetchConversation(
  token: string,
  peerId: string,
  opts?: { cursor?: string; limit?: number }
): Promise<ConversationResponse> {
  const params = new URLSearchParams();
  if (opts?.cursor) params.set("cursor", opts.cursor);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  const res = await fetch(`${API}/api/v1/conversations/${peerId}${q ? `?${q}` : ""}`, {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function searchUsers(
  token: string,
  query: string,
  limit = 8,
  signal?: AbortSignal
): Promise<import("@vaultchat/protocol").UserSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`${API}/api/v1/users/search?${params}`, {
    headers: authHeaders(token),
    signal,
  });
  return parseApiResponse(res);
}

export {
  fetchFriends,
  fetchFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  redeemInvite,
  fetchCommunityChannels,
  fetchChannelCategories,
} from "@vaultchat/client";

export function parseEnvelopeCiphertext(ciphertext: string): EncryptedPayload {
  return JSON.parse(ciphertext) as EncryptedPayload;
}

export type { MessageEnvelope };
