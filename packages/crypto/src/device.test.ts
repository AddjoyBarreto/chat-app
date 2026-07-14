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

  it("reuses Double Ratchet session for follow-up messages (WhisperMessage)", async () => {
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

    const first = await alice.encrypt("bob", 1, "First message", bobBundle);
    expect(first.type).toBe(3);
    await bob.decrypt("alice", 1, first);

    // Bob already has a session after decrypting Alice's PreKey message,
    // so his reply is Whisper even if a bundle is passed (session is reused).
    expect(await bob.hasOpenSession("alice", 1)).toBe(true);
    const bobReply = await bob.encrypt("alice", 1, "Reply from Bob", aliceBundle);
    expect(bobReply.type).toBe(1);
    expect(await alice.decrypt("bob", 1, bobReply)).toBe("Reply from Bob");

    // Passing a fresh bundle must NOT reset an existing confirmed session.
    const bobBundle2 = VaultDevice.bundleFromKeyMaterial(
      "bob",
      1,
      bobMaterial,
      bobMaterial.oneTimePreKeys[1]
    );
    const aliceSecond = await alice.encrypt("bob", 1, "Second message", bobBundle2);
    expect(aliceSecond.type).toBe(1);
    expect(await bob.decrypt("alice", 1, aliceSecond)).toBe("Second message");

    // No bundle needed once the session exists.
    const aliceThird = await alice.encrypt("bob", 1, "Third message");
    expect(aliceThird.type).toBe(1);
    expect(await bob.decrypt("alice", 1, aliceThird)).toBe("Third message");
  });

  it("forceNewSession re-runs X3DH when requested", async () => {
    const alice = await VaultDevice.create("alice");
    const bob = await VaultDevice.create("bob");

    const bobMaterial = await bob.exportKeyMaterial();
    const bobBundle = VaultDevice.bundleFromKeyMaterial(
      "bob",
      1,
      bobMaterial,
      bobMaterial.oneTimePreKeys[0]
    );
    await alice.encrypt("bob", 1, "open", bobBundle);

    const bobBundle2 = VaultDevice.bundleFromKeyMaterial(
      "bob",
      1,
      bobMaterial,
      bobMaterial.oneTimePreKeys[1]
    );
    const forced = await alice.encrypt("bob", 1, "reset", bobBundle2, {
      forceNewSession: true,
    });
    expect(forced.type).toBe(3);
    expect(await bob.decrypt("alice", 1, forced)).toBe("reset");
  });

  it("sends multiple messages reusing one confirmed session", async () => {
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

    const first = await alice.encrypt("bob", 1, "msg-0", bobBundle);
    expect(await bob.decrypt("alice", 1, first)).toBe("msg-0");

    // Confirm the session with a reply so subsequent Alice messages are Whisper (type 1).
    const reply = await bob.encrypt("alice", 1, "ack", aliceBundle);
    expect(await alice.decrypt("bob", 1, reply)).toBe("ack");

    for (let i = 1; i < 3; i++) {
      const encrypted = await alice.encrypt("bob", 1, `msg-${i}`);
      expect(encrypted.type).toBe(1);
      expect(await bob.decrypt("alice", 1, encrypted)).toBe(`msg-${i}`);
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
