/** @deprecated Use ReadStateManager from @vaultchat/client */
export {
  ReadStateManager,
  type ReadStateManager as ReadStateManagerType,
} from "@vaultchat/client";

import { createLocalStorageAdapter, ReadStateManager } from "@vaultchat/client";

const webStorage = createLocalStorageAdapter();

/** Sync-style helpers for legacy web code — prefer ReadStateManager directly. */
export function markPeerRead(userId: string, peerId: string, messageAt: string): void {
  const mgr = new ReadStateManager(webStorage, userId);
  void mgr.load().then(() => mgr.markPeerRead(peerId, messageAt));
}

export function isPeerMessageRead(userId: string, peerId: string, messageAt: string): boolean {
  const mgr = new ReadStateManager(webStorage, userId);
  // Best-effort sync read from localStorage for hot paths
  try {
    const raw = localStorage.getItem(`vaultchat_read_${userId}`);
    if (!raw) return false;
    const state = JSON.parse(raw) as Record<string, string>;
    const lastRead = state[peerId];
    if (!lastRead) return false;
    return new Date(messageAt) <= new Date(lastRead);
  } catch {
    return false;
  }
}

export function clearReadState(userId: string): void {
  void new ReadStateManager(webStorage, userId).clear();
}
