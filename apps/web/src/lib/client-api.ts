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
import { clientEnv } from "@/env/client";

setClientConfig({
  apiBaseUrl: clientEnv.apiBaseUrl,
  wsUrl: clientEnv.wsUrl,
});
