import { describe, expect, it } from "vitest";
import {
  loadConversationTimeline,
  mergeConversationTimeline,
  persistOwnDirectMessage,
  removeTimelineMessage,
} from "./conversation-store.js";
import { getCachedMessage } from "./message-cache.js";
import type { StorageAdapter } from "./storage.js";
import type { DisplayMessage } from "./messages.js";

function memoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}

function msg(id: string, text: string): DisplayMessage {
  return {
    id,
    from: "me",
    content: { type: "text", text },
    time: new Date().toISOString(),
    date: "Today",
    status: "sent",
  };
}

describe("persistOwnDirectMessage", () => {
  it("seals plaintext and strips optimistic client ids", async () => {
    const storage = memoryStorage();
    const userId = "u1";
    const peerId = "p1";
    const optimistic = msg("opt-1", "hello");
    await mergeConversationTimeline(storage, userId, peerId, [optimistic]);

    const sent = msg("server-1", "hello");
    await persistOwnDirectMessage(storage, userId, peerId, sent, {
      replaceOptimisticId: "opt-1",
    });

    const timeline = await loadConversationTimeline(storage, userId, peerId);
    expect(timeline.map((m) => m.id)).toEqual(["server-1"]);
    expect(await getCachedMessage(storage, userId, "server-1")).toMatchObject({
      id: "server-1",
      content: { text: "hello" },
    });
  });

  it("removeTimelineMessage drops a single id", async () => {
    const storage = memoryStorage();
    await mergeConversationTimeline(storage, "u", "p", [
      msg("a", "one"),
      msg("b", "two"),
    ]);
    await removeTimelineMessage(storage, "u", "p", "a");
    const timeline = await loadConversationTimeline(storage, "u", "p");
    expect(timeline.map((m) => m.id)).toEqual(["b"]);
  });
});
