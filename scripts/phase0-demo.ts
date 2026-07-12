/**
 * Phase 0 proof-of-concept: two devices exchange E2EE messages via the API.
 *
 * Usage (with docker compose + migrated DB + dev servers running):
 *   SKIP_EMAIL_VERIFICATION=true pnpm tsx scripts/phase0-demo.ts
 */
import { VaultDevice } from "@vaultchat/crypto";
import { scriptEnv } from "./env.mjs";

const API = scriptEnv.apiBaseUrl;

async function register(username: string, device: VaultDevice, index: number) {
  const material = await device.exportKeyMaterial();
  const res = await fetch(`${API}/api/v1/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@demo.vaultchat`,
      password: "demo-password-123",
      phoneCountryCode: "+1",
      phoneNumber: `555000${String(index).padStart(4, "0")}`,
      identityKeyPublic: material.identityKeyPublic,
      registrationId: material.registrationId,
    }),
  });
  if (!res.ok) throw new Error(`Register failed: ${await res.text()}`);
  const data = (await res.json()) as { userId: string; deviceId: number; token: string };

  const keyRes = await fetch(`${API}/api/v1/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.token}`,
    },
    body: JSON.stringify({
      signedPreKey: material.signedPreKey,
      oneTimePreKeys: material.oneTimePreKeys,
    }),
  });
  if (!keyRes.ok) throw new Error(`Upload keys failed: ${await keyRes.text()}`);

  return { ...data, userId: data.userId };
}

async function fetchBundle(userId: string) {
  const res = await fetch(`${API}/api/v1/keys/${userId}`);
  if (!res.ok) throw new Error(`Bundle failed: ${await res.text()}`);
  return res.json();
}

async function main() {
  const suffix = Date.now().toString(36);
  const aliceDevice = await VaultDevice.create(`alice_${suffix}`);
  const bobDevice = await VaultDevice.create(`bob_${suffix}`);

  console.log("Registering users…");
  const alice = await register(`alice_${suffix}`, aliceDevice, 1);
  const bob = await register(`bob_${suffix}`, bobDevice, 2);

  console.log("Alice encrypts message for Bob…");
  const bundle = await fetchBundle(bob.userId);
  const session = await aliceDevice.createSession(bob.userId, bundle);
  const encrypted = await session.encrypt({ type: "text", text: "Hello from Alice!" });

  const sendRes = await fetch(`${API}/api/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${alice.token}`,
    },
    body: JSON.stringify({
      recipientId: bob.userId,
      ciphertext: JSON.stringify(encrypted),
      messageType: "text",
    }),
  });
  if (!sendRes.ok) throw new Error(`Send failed: ${await sendRes.text()}`);
  console.log("Message sent.");

  const inboxRes = await fetch(`${API}/api/v1/messages`, {
    headers: { Authorization: `Bearer ${bob.token}` },
  });
  if (!inboxRes.ok) throw new Error(`Inbox failed: ${await inboxRes.text()}`);
  const inbox = (await inboxRes.json()) as { messages: { ciphertext: string }[] };
  const msg = inbox.messages[0];
  if (!msg) throw new Error("No message in inbox");

  const bobSession = await bobDevice.createSession(alice.userId, await fetchBundle(alice.userId));
  const decrypted = await bobSession.decrypt(JSON.parse(msg.ciphertext));
  console.log("Bob decrypted:", decrypted);

  console.log("Phase 0 demo OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
