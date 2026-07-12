import { describe, expect, it } from "vitest";
import {
  clearVaultKey,
  openSealedJson,
  sealJson,
  vaultKeyStorageKey,
} from "./local-vault.js";
import type { StorageAdapter } from "./storage.js";

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

describe("local-vault", () => {
  it("seals and opens JSON without exposing plaintext on disk", async () => {
    const storage = memoryStorage();
    const userId = "user-1";
    const payload = { hello: "secret-message", n: 42 };

    const sealed = await sealJson(storage, userId, payload);
    expect(sealed).not.toContain("secret-message");
    expect(JSON.parse(sealed).v).toBe(1);

    const opened = await openSealedJson<typeof payload>(storage, userId, sealed);
    expect(opened).toEqual(payload);
  });

  it("fails closed after vault key is wiped", async () => {
    const storage = memoryStorage();
    const userId = "user-2";
    const sealed = await sealJson(storage, userId, { text: "private" });
    await clearVaultKey(storage, userId);
    expect(await storage.getItem(vaultKeyStorageKey(userId))).toBeNull();

    const opened = await openSealedJson<{ text: string }>(storage, userId, sealed);
    expect(opened).toBeNull();
  });

  it("migrates legacy plaintext JSON", async () => {
    const storage = memoryStorage();
    const legacy = JSON.stringify({ msg1: { id: "msg1", text: "hi" } });
    const opened = await openSealedJson<Record<string, unknown>>(
      storage,
      "user-3",
      legacy
    );
    expect(opened).toEqual({ msg1: { id: "msg1", text: "hi" } });
  });
});
