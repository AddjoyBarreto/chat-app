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
import { clientFetch } from "./http.js";
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
  const res = await clientFetch(apiUrl("/api/v1/users/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function loginOnServer(body: LoginUserRequest): Promise<LoginUserResponse> {
  const res = await clientFetch(apiUrl("/api/v1/users/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(res);
}

export async function fetchMe(token: string): Promise<MeResponse> {
  const res = await clientFetch(apiUrl("/api/v1/users/me"), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function verifyEmailOnServer(token: string): Promise<VerifyEmailResponse> {
  const res = await clientFetch(apiUrl("/api/v1/auth/verify-email"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return parseApiResponse(res);
}

export async function resendVerificationEmail(token: string): Promise<ResendVerificationResponse> {
  const res = await clientFetch(apiUrl("/api/v1/auth/resend-verification"), {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function uploadPreKeys(
  token: string,
  body: import("@vaultchat/protocol").UploadPreKeysRequest
): Promise<void> {
  const res = await clientFetch(apiUrl("/api/v1/keys"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  await parseApiResponse(res);
}

export async function lookupUser(username: string): Promise<UserProfile> {
  const res = await clientFetch(apiUrl(`/api/v1/users/${encodeURIComponent(username)}`));
  return parseApiResponse(res);
}

export async function searchUsers(
  token: string,
  query: string,
  limit = 8,
  signal?: AbortSignal
): Promise<import("@vaultchat/protocol").UserSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await clientFetch(apiUrl(`/api/v1/users/search?${params}`), {
    headers: authHeaders(token),
    signal,
  });
  return parseApiResponse(res);
}

export async function fetchPreKeyBundle(
  userId: string,
  deviceId: number | string = 1
): Promise<PreKeyBundleResponse> {
  const id = typeof deviceId === "number" ? deviceId : Number(deviceId);
  if (!Number.isFinite(id) || id < 1) {
    throw new Error(`Invalid deviceId for prekey fetch: ${String(deviceId)}`);
  }
  const params = id !== 1 ? `?deviceId=${id}` : "";
  const res = await clientFetch(apiUrl(`/api/v1/keys/${userId}${params}`));
  return parseApiResponse(res);
}

export async function fetchUserDevices(
  userId: string
): Promise<import("@vaultchat/protocol").PublicUserDevicesResponse> {
  const res = await clientFetch(apiUrl(`/api/v1/keys/${userId}/devices`));
  return parseApiResponse(res);
}

export async function fetchMyDevices(
  token: string
): Promise<import("@vaultchat/protocol").ListDevicesResponse> {
  const res = await clientFetch(apiUrl("/api/v1/devices"), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

/** Public device IDs for a user (does not consume one-time prekeys). */
export async function listRecipientDeviceIds(recipientId: string): Promise<number[]> {
  const { devices } = await fetchUserDevices(recipientId);
  const ids = devices
    .map((d) => Number(d.deviceId))
    .filter((id) => Number.isFinite(id) && id >= 1);
  return ids.length > 0 ? ids : [1];
}

/** Linked device IDs excluding the current device (does not consume one-time prekeys). */
export async function listOwnOtherDeviceIds(
  token: string,
  myDeviceId: number
): Promise<number[]> {
  const mine = Number(myDeviceId);
  const { devices } = await fetchMyDevices(token);
  return devices
    .map((d) => Number(d.deviceId))
    .filter((id) => Number.isFinite(id) && id >= 1 && id !== mine);
}

/**
 * @deprecated Prefer `listRecipientDeviceIds` + session-aware encrypt — fetching a
 * bundle consumes a one-time prekey even when a Signal session already exists.
 */
export async function fetchRecipientDeviceBundles(
  recipientId: string
): Promise<Array<{ deviceId: number; bundle: PreKeyBundleResponse }>> {
  const deviceIds = await listRecipientDeviceIds(recipientId);
  return Promise.all(
    deviceIds.map(async (deviceId) => ({
      deviceId,
      bundle: await fetchPreKeyBundle(recipientId, deviceId),
    }))
  );
}

/**
 * @deprecated Prefer `listOwnOtherDeviceIds` + session-aware encrypt.
 * Still skips nothing historically — callers should filter `myDeviceId` themselves.
 */
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
  const res = await clientFetch(apiUrl("/api/v1/keys/me"), {
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
  senderCiphertexts?: Record<string, string>,
  recipientCiphertexts?: Record<string, string>
): Promise<SendMessageResponse> {
  const res = await clientFetch(apiUrl("/api/v1/messages"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      recipientId,
      recipientDeviceId,
      ciphertext: JSON.stringify(payload),
      messageType,
      attachmentMeta,
      senderCiphertexts,
      recipientCiphertexts,
    }),
  });
  return parseApiResponse(res);
}

export async function fetchAccountBackup(
  token: string
): Promise<import("@vaultchat/protocol").AccountKeyBackupResponse> {
  const res = await clientFetch(apiUrl("/api/v1/keys/backup"), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function uploadAccountBackup(
  token: string,
  backup: string
): Promise<{ ok: true }> {
  const res = await clientFetch(apiUrl("/api/v1/keys/backup"), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ backup }),
  });
  return parseApiResponse(res);
}

export async function fetchInbox(
  token: string,
  opts?: import("@vaultchat/protocol").PaginationOptions
): Promise<InboxResponse> {
  const params = new URLSearchParams();
  if (opts?.cursor) params.set("cursor", opts.cursor);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  const res = await clientFetch(apiUrl(`/api/v1/messages${q ? `?${q}` : ""}`), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

/** Walk inbox pages newest-first until exhausted or maxPages. */
export async function forEachInboxPage(
  token: string,
  onPage: (messages: import("@vaultchat/protocol").MessageEnvelope[]) => void | Promise<void>,
  opts?: { pageSize?: number; maxPages?: number }
): Promise<void> {
  const pageSize = opts?.pageSize ?? 50;
  const maxPages = opts?.maxPages ?? 20;
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await fetchInbox(token, { cursor, limit: pageSize });
    await onPage(page.messages);
    cursor = page.hasMore ? page.cursor : undefined;
    pages++;
  } while (cursor && pages < maxPages);
}

export async function fetchConversations(token: string): Promise<import("@vaultchat/protocol").ConversationsResponse> {
  const res = await clientFetch(apiUrl("/api/v1/conversations"), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function fetchDmReadState(
  token: string
): Promise<import("@vaultchat/protocol").DmReadStateResponse> {
  const res = await clientFetch(apiUrl("/api/v1/conversations/read-state"), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function updateDmReadState(
  token: string,
  peerId: string,
  lastReadAt: string
): Promise<{ ok: true }> {
  const res = await clientFetch(apiUrl(`/api/v1/conversations/read-state/${peerId}`), {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ lastReadAt }),
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
  const res = await clientFetch(apiUrl(`/api/v1/conversations/${peerId}${q ? `?${q}` : ""}`), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export async function registerPushToken(
  token: string,
  pushToken: string,
  platform: "ios" | "android" | "web"
): Promise<void> {
  const res = await clientFetch(apiUrl("/api/v1/devices/push-token"), {
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
  const res = await clientFetch(apiUrl("/api/v1/media/upload-url"), {
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
  const res = await clientFetch(apiUrl(`/api/v1/media/${mediaId}/download-url`), {
    headers: authHeaders(token),
  });
  return parseApiResponse(res);
}

export function parseEnvelopeCiphertext(ciphertext: string): EncryptedPayload {
  return JSON.parse(ciphertext) as EncryptedPayload;
}

export type { MessageEnvelope };
