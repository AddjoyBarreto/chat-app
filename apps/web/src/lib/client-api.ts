/** Re-export shared API client — configure via setClientConfig or NEXT_PUBLIC_* env. */
export {
  registerOnServer,
  loginOnServer,
  fetchMe,
  verifyEmailOnServer,
  resendVerificationEmail,
  uploadPreKeys,
  lookupUser,
  fetchPreKeyBundle,
  sendEncryptedMessage,
  fetchInbox,
  fetchConversations,
  fetchConversation,
  searchUsers,
  fetchFriends,
  fetchFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  redeemInvite,
  fetchCommunityChannels,
  fetchChannelCategories,
  parseEnvelopeCiphertext,
  type MessageEnvelope,
} from "@vaultchat/client";

import { setClientConfig } from "@vaultchat/client";

setClientConfig({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000",
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001",
});
