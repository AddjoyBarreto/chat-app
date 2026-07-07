import type { PresenceStatus } from "@vaultchat/protocol";

export const PRESENCE_KEY_PREFIX = "vaultchat:presence:";
export const PRESENCE_TTL_SEC = 86_400;

export function presenceRedisKey(userId: string): string {
  return `${PRESENCE_KEY_PREFIX}${userId}`;
}

/** What friends should see for a user's chosen status. */
export function publicPresenceStatus(status: PresenceStatus): PresenceStatus {
  return status === "invisible" ? "offline" : status;
}

export function isConnectedPresence(status: PresenceStatus): boolean {
  return status !== "offline";
}
