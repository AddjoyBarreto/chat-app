import type { PreKeyBundleResponse } from "@vaultchat/protocol";
import type { DeviceKeyMaterial } from "./device.js";
import { VaultDevice } from "./device.js";

let verifyCounter = 0;

/** Returns true when libsignal can process the bundle (signature matches identity). */
export async function verifyPreKeyBundle(bundle: PreKeyBundleResponse): Promise<boolean> {
  try {
    const device = await VaultDevice.create(`__verify_${verifyCounter++}`);
    const probe: PreKeyBundleResponse = { ...bundle, oneTimePreKey: undefined };
    await device.establishSession(probe);
    return true;
  } catch {
    return false;
  }
}

/** True when server-published keys match what this device would upload. */
export function deviceMaterialMatchesServer(
  material: DeviceKeyMaterial,
  server: Pick<PreKeyBundleResponse, "identityKey" | "registrationId" | "signedPreKey">
): boolean {
  return (
    server.identityKey === material.identityKeyPublic &&
    server.registrationId === material.registrationId &&
    server.signedPreKey.keyId === material.signedPreKey.keyId &&
    server.signedPreKey.publicKey === material.signedPreKey.publicKey
  );
}
