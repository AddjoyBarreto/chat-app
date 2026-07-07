// ─── API error shape ─────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
}

// ─── Users & devices ─────────────────────────────────────────────────────────

export interface RegisterUserRequest {
  username: string;
  email: string;
  password: string;
  phoneCountryCode: string;
  phoneNumber: string;
  deviceName?: string;
  identityKeyPublic: string; // base64
  registrationId: number;
}

export interface RegisterUserResponse {
  userId: string;
  deviceId: number;
  token: string;
  emailVerified: boolean;
}

export interface LoginUserRequest {
  identifier: string;
  password: string;
  deviceId?: number;
  deviceName?: string;
  identityKeyPublic?: string;
  registrationId?: number;
}

export interface LoginUserResponse {
  userId: string;
  deviceId: number;
  token: string;
  username: string;
  emailVerified: boolean;
  /** True when server cleared stale prekeys — client must upload fresh key material */
  preKeysRequired?: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface UserSearchResult {
  id: string;
  username: string;
  emailVerified: boolean;
  relationship: "none" | "friend" | "pending_out" | "pending_in";
}

export interface UserSearchResponse {
  users: UserSearchResult[];
}

export interface MeResponse {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  phoneCountryCode: string;
  phoneNumber: string;
  createdAt: string;
}

export interface VerifyEmailResponse {
  ok: true;
  emailVerified: boolean;
}

export interface ResendVerificationResponse {
  ok: true;
  message: string;
}

// ─── Prekeys (Signal Protocol) ───────────────────────────────────────────────

export interface SignedPreKeyPayload {
  keyId: number;
  publicKey: string; // base64
  signature: string; // base64
}

export interface OneTimePreKeyPayload {
  keyId: number;
  publicKey: string; // base64
}

export interface UploadPreKeysRequest {
  /** Omit when only replenishing one-time prekeys. */
  signedPreKey?: SignedPreKeyPayload;
  oneTimePreKeys: OneTimePreKeyPayload[];
}

export interface PreKeyBundleResponse {
  userId: string;
  deviceId: number;
  registrationId: number;
  identityKey: string; // base64
  signedPreKey: SignedPreKeyPayload;
  oneTimePreKey?: OneTimePreKeyPayload;
}

/** Authenticated peek at own published keys — does not consume a one-time prekey. */
export interface OwnDeviceKeysResponse {
  userId: string;
  deviceId: number;
  registrationId: number;
  identityKey: string;
  signedPreKey: SignedPreKeyPayload;
}

// ─── Messages (server stores ciphertext only) ────────────────────────────────

export type MessageType = "text" | "image" | "video" | "gif" | "audio" | "file";

export interface SendMessageRequest {
  recipientId: string;
  recipientDeviceId?: number;
  ciphertext: string; // base64 — Signal Protocol encrypted payload
  messageType: MessageType;
  /** Optional encrypted attachment metadata (R2 key, size, mime) — also ciphertext */
  attachmentMeta?: string;
  /** Per-device ciphertext so sender can read on all logged-in devices (E2EE sync). */
  senderCiphertexts?: Record<string, string>;
  /** Per-device ciphertext so recipient can read on all logged-in devices. */
  recipientCiphertexts?: Record<string, string>;
}

export interface MessageEnvelope {
  id: string;
  senderId: string;
  senderDeviceId: number;
  recipientId: string;
  ciphertext: string;
  messageType: MessageType;
  attachmentMeta?: string;
  senderCiphertexts?: Record<string, string>;
  recipientCiphertexts?: Record<string, string>;
  createdAt: string;
}

export interface UserDeviceInfo {
  deviceId: number;
  deviceName?: string;
}

export interface ListDevicesResponse {
  devices: UserDeviceInfo[];
}

/** Public device list for multi-device E2EE fan-out (device ids only). */
export interface PublicUserDevicesResponse {
  devices: UserDeviceInfo[];
}

export interface AccountKeyBackupResponse {
  backup: string | null;
}

export interface PutAccountKeyBackupRequest {
  backup: string;
}

export interface SendMessageResponse {
  messageId: string;
  createdAt: string;
}

export interface InboxResponse {
  messages: MessageEnvelope[];
  cursor?: string;
  hasMore?: boolean;
}

export interface ConversationResponse {
  peerId: string;
  messages: MessageEnvelope[];
  cursor?: string;
  hasMore?: boolean;
}

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface ConversationPreview {
  peerId: string;
  peerUsername: string;
  lastMessageAt: string;
}

export interface ConversationsResponse {
  conversations: ConversationPreview[];
}

export interface DmReadStateResponse {
  readState: Record<string, string>;
}

export interface UpdateDmReadStateRequest {
  lastReadAt: string;
}

/** JSON inside Signal ciphertext — supports text and inline images (dev/MVP) */
export interface MessageContent {
  type: "text" | "image" | "video" | "media" | "group_key";
  text?: string;
  image?: { mime: string; data: string };
  video?: { mime: string; data: string };
  /** Encrypted media stored in R2 — key/nonce delivered inside E2EE message */
  media?: {
    mediaId: string;
    mime: string;
    key: string;
    nonce: string;
    sizeBytes: number;
  };
  /** Group key distribution (encrypted via pairwise session) */
  groupKey?: { groupId: string; key: string };
  /** Per-channel key distribution (Option B) */
  channelKey?: { channelId: string; key: string };
}

// ─── Media (R2) ──────────────────────────────────────────────────────────────

export interface MediaUploadUrlRequest {
  mimeType: string;
  sizeBytes: number;
}

export interface MediaUploadUrlResponse {
  mediaId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface MediaDownloadUrlResponse {
  downloadUrl: string;
  expiresAt: string;
}

// ─── Push tokens ─────────────────────────────────────────────────────────────

export interface RegisterPushTokenRequest {
  pushToken: string;
  platform: "ios" | "android" | "web";
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export interface CreateGroupRequest {
  name: string;
  memberUsernames: string[];
}

export interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  createdBy: string;
  memberCount: number;
  createdAt: string;
}

export interface GroupMemberInfo {
  userId: string;
  username: string;
  role: string;
}

export interface GroupMessageEnvelope {
  id: string;
  groupId: string;
  senderId: string;
  senderDeviceId: number;
  ciphertext: string;
  messageType: MessageType;
  createdAt: string;
}

export interface SendGroupMessageRequest {
  ciphertext: string;
  messageType: MessageType;
}

export interface GroupMessagesResponse {
  messages: GroupMessageEnvelope[];
  cursor?: string;
  hasMore?: boolean;
}

// ─── Social (friends, privacy, invites) ─────────────────────────────────────

export type DmPolicy = "everyone" | "friends_only";

export interface FriendInfo {
  userId: string;
  username: string;
  since: string;
}

export interface FriendRequestInfo {
  id: string;
  senderId: string;
  senderUsername: string;
  recipientId: string;
  recipientUsername: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export interface FriendsListResponse {
  friends: FriendInfo[];
}

export interface FriendRequestsResponse {
  incoming: FriendRequestInfo[];
  outgoing: FriendRequestInfo[];
}

export interface BlockInfo {
  userId: string;
  username: string;
  blockedAt: string;
}

export interface BlocksListResponse {
  blocks: BlockInfo[];
}

export interface PrivacySettingsResponse {
  dmPolicy: DmPolicy;
}

export interface UpdatePrivacyRequest {
  dmPolicy: DmPolicy;
}

export interface CreateInviteRequest {
  maxUses?: number;
  expiresInHours?: number;
}

export interface InviteInfo {
  id: string;
  code: string;
  communityId: string;
  communityName: string;
  maxUses?: number;
  useCount: number;
  expiresAt?: string;
  createdAt: string;
}

export interface RedeemInviteResponse {
  communityId: string;
  communityName: string;
}

// ─── Communities (Discord servers) ───────────────────────────────────────────

export interface UpdateCommunityRequest {
  name?: string;
  description?: string;
}

export interface CommunityMemberActionResponse {
  ok: true;
}

// ─── Channels ────────────────────────────────────────────────────────────────

export type ChannelType = "text" | "voice" | "announcement";

export interface ChannelCategoryInfo {
  id: string;
  communityId: string;
  name: string;
  position: number;
}

export interface ChannelInfo {
  id: string;
  communityId: string;
  categoryId?: string;
  name: string;
  type: ChannelType;
  topic?: string;
  position: number;
}

export interface CreateChannelRequest {
  name: string;
  type?: ChannelType;
  categoryId?: string;
  topic?: string;
}

export interface CreateCategoryRequest {
  name: string;
}

export interface ChannelMessageEnvelope {
  id: string;
  channelId: string;
  senderId: string;
  senderDeviceId: number;
  ciphertext: string;
  messageType: MessageType;
  createdAt: string;
}

export interface ChannelMessagesResponse {
  messages: ChannelMessageEnvelope[];
  cursor?: string;
  hasMore?: boolean;
}

export interface SendChannelMessageRequest {
  ciphertext: string;
  messageType: MessageType;
}

export interface VoicePresenceInfo {
  userId: string;
  username: string;
  joinedAt: string;
}

export interface VoicePresenceResponse {
  members: VoicePresenceInfo[];
}

// ─── Calls (WebRTC signaling) ────────────────────────────────────────────────

export type CallType = "voice" | "video";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServerConfig[];
}

export interface SessionDescriptionPayload {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp: string;
}

export interface IceCandidatePayload {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

// ─── WebSocket events ────────────────────────────────────────────────────────

export type WsClientEvent =
  | { type: "auth"; token: string }
  | { type: "ping" }
  | { type: "call_invite"; callId: string; calleeId: string; callType: CallType }
  | { type: "call_accept"; callId: string }
  | { type: "call_reject"; callId: string; reason?: string }
  | { type: "call_offer"; callId: string; sdp: SessionDescriptionPayload }
  | { type: "call_answer"; callId: string; sdp: SessionDescriptionPayload }
  | { type: "call_ice"; callId: string; candidate: IceCandidatePayload }
  | { type: "call_end"; callId: string };

export type WsServerEvent =
  | { type: "auth_ok"; userId: string }
  | { type: "auth_error"; error: string }
  | { type: "message"; envelope: MessageEnvelope }
  | { type: "group_message"; envelope: GroupMessageEnvelope }
  | { type: "channel_message"; envelope: ChannelMessageEnvelope }
  | { type: "friend_request"; request: FriendRequestInfo }
  | { type: "friend_accept"; friend: FriendInfo }
  | { type: "member_join"; communityId: string; userId: string; username: string }
  | { type: "member_leave"; communityId: string; userId: string }
  | { type: "voice_presence"; channelId: string; members: VoicePresenceInfo[] }
  | { type: "call_incoming"; callId: string; callerId: string; callType: CallType }
  | { type: "call_accepted"; callId: string; peerId: string }
  | { type: "call_rejected"; callId: string; reason?: string }
  | { type: "call_offer"; callId: string; sdp: SessionDescriptionPayload }
  | { type: "call_answer"; callId: string; sdp: SessionDescriptionPayload }
  | { type: "call_ice"; callId: string; candidate: IceCandidatePayload }
  | { type: "call_ended"; callId: string; reason?: string }
  | { type: "pong" }
  | { type: "error"; error: string };

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: "ok";
  version: string;
  service: string;
}
