import { describe, expect, it } from "vitest";
import { GroupCipher } from "./group.js";

describe("GroupCipher", () => {
  it("encrypts and decrypts group messages", async () => {
    const { cipher, keyBase64 } = await GroupCipher.generate();
    const restored = GroupCipher.fromKeyBase64(keyBase64);

    const encrypted = await cipher.encrypt("Hello group!");
    const plaintext = await restored.decrypt(encrypted);

    expect(plaintext).toBe("Hello group!");
  });
});
