import type { StorageAdapter } from "./storage.js";
import { fetchDmReadState, updateDmReadState } from "./api.js";

const STORAGE_PREFIX = "vaultchat_read_";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export interface ReadStateManagerOptions {
  /** When set, merges server read cursors on load and syncs markPeerRead to API. */
  token?: string;
}

/** In-memory read-state with async persistence (works on web, mobile, desktop). */
export class ReadStateManager {
  private cache: Record<string, string> = {};
  private loaded = false;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly userId: string,
    private readonly options: ReadStateManagerOptions = {}
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await this.storage.getItem(storageKey(this.userId));
      this.cache = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      this.cache = {};
    }

    if (this.options.token) {
      try {
        const { readState } = await fetchDmReadState(this.options.token);
        let changed = false;
        for (const [peerId, at] of Object.entries(readState) as [string, string][]) {
          const prev = this.cache[peerId];
          if (!prev || new Date(at) > new Date(prev)) {
            this.cache[peerId] = at;
            changed = true;
          }
        }
        if (changed) {
          await this.storage.setItem(storageKey(this.userId), JSON.stringify(this.cache));
        }
      } catch {
        // non-fatal — local state still works offline
      }
    }

    this.loaded = true;
  }

  markPeerRead(peerId: string, messageAt: string): void {
    if (!messageAt) return;
    const prev = this.cache[peerId];
    if (!prev || new Date(messageAt) > new Date(prev)) {
      this.cache[peerId] = messageAt;
      void this.storage.setItem(storageKey(this.userId), JSON.stringify(this.cache));
      if (this.options.token) {
        void updateDmReadState(this.options.token, peerId, messageAt).catch(() => {});
      }
    }
  }

  isPeerMessageRead(peerId: string, messageAt: string): boolean {
    const lastRead = this.cache[peerId];
    if (!lastRead) return false;
    return new Date(messageAt) <= new Date(lastRead);
  }

  async clear(): Promise<void> {
    this.cache = {};
    this.loaded = true;
    await this.storage.removeItem(storageKey(this.userId));
  }
}
