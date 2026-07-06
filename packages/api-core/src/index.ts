import { createDb } from "@vaultchat/db";
import type { ApiContext } from "./context.js";
import { createRedis } from "./redis.js";

export { createToken, verifyToken, type AuthClaims } from "./auth.js";
export { ApiCoreError, isApiCoreError } from "./errors.js";
export { createRedis, publishMessage, MESSAGE_CHANNEL_PREFIX } from "./redis.js";
export type { ApiContext } from "./context.js";
export { registerUser, loginUser, verifyEmail, resendVerificationEmail, getMe, requireVerifiedEmail } from "./auth-users.js";
export { setEmailConfig, getEmailConfig } from "./email.js";
export { registerDeviceForUser, getUserByUsername, searchUsers, uploadPreKeys, getPreKeyBundle, getOwnDeviceKeys, isDeviceBundleValid, listUserDevices } from "./users.js";
export { sendMessage, getInbox, getConversation, listConversations } from "./messages.js";
export {
  areFriends,
  assertCanDm,
  listFriends,
  listFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  listBlocks,
  getPrivacySettings,
  updatePrivacySettings,
} from "./friends.js";
export { createInvite, listCommunityInvites, redeemInvite } from "./invites.js";
export {
  updateCommunity,
  kickCommunityMember,
  promoteCommunityMember,
} from "./communities.js";
export {
  listChannels,
  listChannelCategories,
  createChannel,
  createChannelCategory,
  getChannelMessages,
  sendChannelMessage,
  joinVoiceChannel,
  leaveVoiceChannel,
  getVoicePresence,
} from "./channels.js";
export {
  createMediaUploadUrl,
  createMediaDownloadUrl,
  storeLocalMedia,
  readLocalMedia,
  setMediaConfig,
  type MediaStorageConfig,
} from "./media.js";
export { registerPushToken, sendPushToUser } from "./push.js";
export {
  getIceServers,
  notifyIncomingCall,
  setTurnConfig,
  type TurnConfig,
} from "./calls.js";
export {
  createGroup,
  listUserGroups,
  getGroupMembers,
  sendGroupMessage,
  getGroupMessages,
} from "./groups.js";
export { toApiError } from "./http.js";

export interface CreateApiContextOptions {
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
}

export function createApiContext(options: CreateApiContextOptions): ApiContext {
  return {
    db: createDb(options.databaseUrl),
    redis: createRedis(options.redisUrl),
    jwtSecret: options.jwtSecret,
  };
}
