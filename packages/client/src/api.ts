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
import { getClientConfig } from "./config.js";
import { parseApiResponse } from "./errors.js";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function apiUrl(path: string) {
  return `${getClientConfig().apiBaseUrl}${path}`;
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
  const res = await fetch(apiUrl("/api/v1/users/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function loginOnServer(body: LoginUserRequest): Promise<LoginUserResponse> {
  const res = await fetch(apiUrl("/api/v1/users/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function fetchMe(token: string): Promise<MeResponse> {
  const res = await fetch(apiUrl("/api/v1/users/me"), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function verifyEmailOnServer(token: string): Promise<VerifyEmailResponse> {
  const res = await fetch(apiUrl("/api/v1/auth/verify-email"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return parseApiResponse(res);
}

export async function resendVerificationEmail(token: string): Promise<ResendVerificationResponse> {
  const res = await fetch(apiUrl("/api/v1/auth/resend-verification"), {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function uploadPreKeys(
  token: string,
  body: import("@vaultchat/protocol").UploadPreKeysRequest
): Promise<void> {
  const res = await fetch(apiUrl("/api/v1/keys"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  await parseApiResponse(res);
}

export async function lookupUser(username: string): Promise<UserProfile> {
  const res = await fetch(apiUrl(`/api/v1/users/${encodeURIComponent(username)}`));
  return parseApiResponse(res);
}

export async function searchUsers(
  token: string,
  query: string,
  limit = 8,
  signal?: AbortSignal
): Promise<import("@vaultchat/protocol").UserSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(apiUrl(`/api/v1/users/search?${params}`), {
    headers: authHeaders(token),
    signal,
  });
  return parseApiResponse(res);
}

export async function fetchPreKeyBundle(
  userId: string,
  deviceId = 1
): Promise<PreKeyBundleResponse> {
  const params = deviceId !== 1 ? `?deviceId=${deviceId}` : "";
  const res = await fetch(apiUrl(`/api/v1/keys/${userId}${params}`));
  return parseApiResponse(res);
}

export async function fetchMyDevices(
  token: string
): Promise<import("@vaultchat/protocol").ListDevicesResponse> {
  const res = await fetch(apiUrl("/api/v1/devices"), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function fetchOwnDeviceBundles(
  token: string,
  userId: string
): Promise<Array<{ deviceId: number; bundle: PreKeyBundleResponse }>> {
  const { devices } = await fetchMyDevices(token);
  return Promise.all(
    devices.map(async (d) => ({
      deviceId: d.deviceId,
      bundle: await fetchPreKeyBundle(userId, d.deviceId),
    }))
  );
}

export async function fetchOwnDeviceKeys(token: string): Promise<import("@vaultchat/protocol").OwnDeviceKeysResponse> {
  const res = await fetch(apiUrl("/api/v1/keys/me"), {
    headers: authHeaders(token),
  });
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
  const res = await fetch(apiUrl("/api/v1/messages"), {
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
  const res = await fetch(apiUrl("/api/v1/messages"), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function fetchConversations(token: string): Promise<import("@vaultchat/protocol").ConversationsResponse> {
  const res = await fetch(apiUrl("/api/v1/conversations"), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function fetchConversation(
  token: string,
  peerId: string,
  opts?: import("@vaultchat/protocol").PaginationOptions
): Promise<ConversationResponse> {
  const params = new URLSearchParams();
  if (opts?.cursor) params.set("cursor", opts.cursor);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  const res = await fetch(apiUrl(`/api/v1/conversations/${peerId}${q ? `?${q}` : ""}`), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function registerPushToken(
  token: string,
  pushToken: string,
  platform: "ios" | "android" | "web"
): Promise<void> {
  const res = await fetch(apiUrl("/api/v1/devices/push-token"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ pushToken, platform }),
  });
  await parseApiResponse(res);
}

export async function requestMediaUploadUrl(
  token: string,
  mimeType: string,
  sizeBytes: number
): Promise<{ mediaId: string; uploadUrl: string; expiresAt: string }> {
  const res = await fetch(apiUrl("/api/v1/media/upload-url"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ mimeType, sizeBytes }),
  });
  return parseApiResponse(res);
}

export async function requestMediaDownloadUrl(
  token: string,
  mediaId: string
): Promise<{ downloadUrl: string; expiresAt: string }> {
  const res = await fetch(apiUrl(`/api/v1/media/${mediaId}/download-url`), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export function parseEnvelopeCiphertext(ciphertext: string): EncryptedPayload {
  return JSON.parse(ciphertext) as EncryptedPayload;
}

export type { MessageEnvelope };
