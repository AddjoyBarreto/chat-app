import { describe, expect, it } from "vitest";
import { VaultDevice, deviceMaterialMatchesServer } from "./index.js";

describe("deviceMaterialMatchesServer", () => {
  it("detects signed prekey drift between local and server", async () => {
    const bob = await VaultDevice.create("bob");
    const material = await bob.exportKeyMaterial();
    const serverBundle = VaultDevice.bundleFromKeyMaterial("bob", 1, material);

    expect(deviceMaterialMatchesServer(material, serverBundle)).toBe(true);

    const staleBundle = {
      ...serverBundle,
      signedPreKey: { ...serverBundle.signedPreKey, keyId: material.signedPreKey.keyId + 1 },
    };
    expect(deviceMaterialMatchesServer(material, staleBundle)).toBe(false);
  });
});

describe("stale signed prekey on wire", () => {
  it("recipient cannot decrypt when sender used an old signed prekey", async () => {
    const bob = await VaultDevice.create("bob");
    const alice = await VaultDevice.create("alice");

    const bobMaterialV1 = await bob.exportKeyMaterial();
    const bobBundleV1 = VaultDevice.bundleFromKeyMaterial(
      "bob",
      1,
      bobMaterialV1,
      bobMaterialV1.oneTimePreKeys[0]
    );

    const bobCurrent = await VaultDevice.create("bob");
    const encrypted = await alice.encrypt("bob", 1, "encrypted with stale bundle", bobBundleV1);

    await expect(bobCurrent.decrypt("alice", 1, encrypted)).rejects.toThrow();
  });
});
