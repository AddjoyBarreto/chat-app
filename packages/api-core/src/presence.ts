import type { PresenceStatus } from "@vaultchat/protocol";

export const PRESENCE_KEY_PREFIX = "vaultchat:presence:";
/** Must stay above the client ping interval (25s) so heartbeats keep presence alive. */
export const PRESENCE_TTL_SEC = 90;

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
