import { describe, expect, it } from "vitest";
import { VaultDevice } from "./device.js";

describe("VaultDevice E2EE roundtrip", () => {
  it("alice encrypts, bob decrypts (first message / PreKey)", async () => {
    const alice = await VaultDevice.create("alice");
    const bob = await VaultDevice.create("bob");

    const bobMaterial = await bob.exportKeyMaterial();
    const bobBundle = VaultDevice.bundleFromKeyMaterial(
      "bob",
      1,
      bobMaterial,
      bobMaterial.oneTimePreKeys[0]
    );

    const encrypted = await alice.encrypt("bob", 1, "Hello Bob — this is secret.", bobBundle);
    const plaintext = await bob.decrypt("alice", 1, encrypted);

    expect(plaintext).toBe("Hello Bob — this is secret.");
    expect(encrypted.type).toBe(3); // PreKeyWhisperMessage on first send
  });

  it("bob replies with established session (WhisperMessage)", async () => {
    const alice = await VaultDevice.create("alice");
    const bob = await VaultDevice.create("bob");

    const bobMaterial = await bob.exportKeyMaterial();
    const aliceMaterial = await alice.exportKeyMaterial();

    const bobBundle = VaultDevice.bundleFromKeyMaterial(
      "bob",
      1,
      bobMaterial,
      bobMaterial.oneTimePreKeys[0]
    );
    const aliceBundle = VaultDevice.bundleFromKeyMaterial(
      "alice",
      1,
      aliceMaterial,
      aliceMaterial.oneTimePreKeys[0]
    );

    await alice.encrypt("bob", 1, "First message", bobBundle);
    const bobReply = await bob.encrypt("alice", 1, "Reply from Bob", aliceBundle);

    expect(bobReply.type).toBe(3);

    const aliceReads = await alice.decrypt("bob", 1, bobReply);
    expect(aliceReads).toBe("Reply from Bob");

    const aliceSecond = await alice.encrypt("bob", 1, "Second message", bobBundle);
    expect(aliceSecond.type).toBe(3);
  });

  it("sends multiple messages with fresh bundle each time", async () => {
    const alice = await VaultDevice.create("alice");
    const bob = await VaultDevice.create("bob");

    for (let i = 0; i < 3; i++) {
      const bobMaterial = await bob.exportKeyMaterial();
      const bobBundle = VaultDevice.bundleFromKeyMaterial(
        "bob",
        1,
        bobMaterial,
        bobMaterial.oneTimePreKeys[i]
      );
      const encrypted = await alice.encrypt("bob", 1, `msg-${i}`, bobBundle);
      const plaintext = await bob.decrypt("alice", 1, encrypted);
      expect(plaintext).toBe(`msg-${i}`);
    }
  });

  it("serializes ciphertext as UTF-8-safe JSON for database storage", async () => {
    const alice = await VaultDevice.create("alice");
    const bob = await VaultDevice.create("bob");

    const bobMaterial = await bob.exportKeyMaterial();
    const bobBundle = VaultDevice.bundleFromKeyMaterial(
      "bob",
      1,
      bobMaterial,
      bobMaterial.oneTimePreKeys[0]
    );

    const encrypted = await alice.encrypt("bob", 1, "Hello Bob — this is secret.", bobBundle);
    const wire = JSON.parse(JSON.stringify(encrypted)) as typeof encrypted;
    const plaintext = await bob.decrypt("alice", 1, wire);

    expect(plaintext).toBe("Hello Bob — this is secret.");
  });
});
