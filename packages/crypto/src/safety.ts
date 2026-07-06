import { FingerprintGenerator } from "@privacyresearch/libsignal-protocol-typescript";
import { base64ToArrayBuffer } from "./buffers.js";

/** Generate a safety number string for key verification (like Signal). */
export async function generateSafetyNumber(
  localUserId: string,
  localIdentityKeyPublic: string,
  remoteUserId: string,
  remoteIdentityKeyPublic: string
): Promise<string> {
  const generator = new FingerprintGenerator(5200);
  return generator.createFor(
    localUserId,
    base64ToArrayBuffer(localIdentityKeyPublic),
    remoteUserId,
    base64ToArrayBuffer(remoteIdentityKeyPublic)
  );
}
