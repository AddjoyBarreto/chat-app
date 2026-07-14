# Encryption & Decryption — Current Implementation

How VaultChat encrypts and decrypts data **as implemented today** across the shared crypto library, backend, web, desktop, and mobile.

> This document describes the code as it exists now, not the product roadmap. The root `README.md` still mentions Sender Keys for groups; the shipped group design is a shared AES-256-GCM community key.

---

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────┐
│  Clients: web / desktop (Tauri) / mobile (Expo RN)               │
│  Shared: @vaultchat/crypto + @vaultchat/client                   │
│                                                                  │
│  1:1 DMs ........ Signal Protocol (X3DH + Double Ratchet)        │
│  Groups/channels  Shared AES-256-GCM (not Sender Keys)           │
│  Media .......... AES-256-GCM; key+nonce inside E2EE message     │
│  Local cache .... AES-256-GCM “vault” around plaintext cache     │
│  Key backup ..... PBKDF2-SHA256 → AES-256-GCM                    │
└───────────────────────────────┬──────────────────────────────────┘
                                │ ciphertext + public keys only
┌───────────────────────────────▼──────────────────────────────────┐
│  Backend: @vaultchat/api-core + Postgres + gateway               │
│  Stores opaque ciphertext; never decrypts messages               │
│  Auth only: scrypt passwords, JWT sessions                       │
└──────────────────────────────────────────────────────────────────┘
```

**There is no per-platform crypto reimplementation.** Web, desktop, and mobile all call the same TypeScript packages. Platform differences are only the WebCrypto provider and where keys are persisted.

| Package / area | Role |
|----------------|------|
| `packages/crypto` | Signal device, group AES, media AES, backup, safety numbers |
| `packages/client` | Orchestration: encrypt/decrypt messages, group keys, vault, media upload |
| `packages/api-core` | Stores ciphertext + public prekeys; scrypt/JWT for account auth |
| `apps/web` | Browser `crypto.subtle` + `localStorage` |
| `apps/desktop` | Tauri WebView → same as web |
| `apps/mobile` | msrcrypto WebCrypto polyfill + Expo SecureStore |

---

## Algorithms & parameters

| Layer | Algorithm | Key / params | Wire / storage format |
|-------|-----------|--------------|------------------------|
| 1:1 DM | Signal (libsignal-protocol-typescript): Curve25519, X3DH, Double Ratchet | Identity + signed prekey + one-time prekeys | `JSON.stringify(EncryptedPayload)` in DB |
| Group / channel | AES-256-GCM | 256-bit key, **12-byte** random nonce | `{"n":"<b64>","c":"<b64>"}` |
| Media attachment | AES-256-GCM | Per-file 256-bit key + 12-byte nonce | Ciphertext on R2; `key`+`nonce` inside message JSON |
| Local message vault | AES-256-GCM | Per-user raw key in device storage | `{"v":1,"n":"<b64>","c":"<b64>"}` |
| Account key backup | PBKDF2 → AES-256-GCM | **310_000** iters, SHA-256, **16-byte** salt, **12-byte** IV | `{"v":1,"salt","iv","ct"}` |
| Account password (server) | scrypt | 16-byte salt, 64-byte derived key | `salt:hexKey` |
| Safety numbers | libsignal `FingerprintGenerator(5200)` | — | Display string |
| Calls | WebRTC DTLS-SRTP | Transport E2EE only | Not `@vaultchat/crypto` |

There is **no app-level RSA**. ECDH appears only inside libsignal (X3DH).

Dependency: `@privacyresearch/libsignal-protocol-typescript`.

---

## Shared library: `@vaultchat/crypto`

| File | Responsibility |
|------|----------------|
| `packages/crypto/src/device.ts` | `VaultDevice` — keygen, session, encrypt/decrypt |
| `packages/crypto/src/store.ts` | In-memory Signal store + serialize/restore |
| `packages/crypto/src/group.ts` | `GroupCipher` — AES-256-GCM group messages |
| `packages/crypto/src/media.ts` | `encryptAttachment` / `decryptAttachment` |
| `packages/crypto/src/backup.ts` | Password-encrypted account key backup |
| `packages/crypto/src/content.ts` | `MessageContent` JSON serialize/parse |
| `packages/crypto/src/buffers.ts` | base64 / UTF-8 / Latin-1 helpers |
| `packages/crypto/src/safety.ts` | Safety numbers |
| `packages/crypto/src/bundle.ts` | Prekey bundle verification |

---

## 1:1 direct messages (Signal)

### Device keys

On `VaultDevice.create(userId, deviceId)`:

1. Registration ID
2. Identity key pair (Curve25519)
3. Signed prekey + signature
4. **10** one-time prekeys (replenish when local count &lt; 5)

**Public** material is uploaded to the server (`identityKeyPublic`, signed prekey, one-time prekeys). **Private** keys stay on the device (or in an optional password-encrypted backup).

### Payload shape

```ts
interface EncryptedPayload {
  type: number;              // 3 = PreKeyWhisperMessage, 1 = WhisperMessage
  body: string;              // base64(binary Signal body)
  bodyEncoding?: "base64";   // set on new encodes
  registrationId?: number;
}
```

Stored in Postgres as **`JSON.stringify(payload)`**, not raw bytes. Multi-device fan-out:

- `recipientCiphertexts`: `Record<deviceId, JSON EncryptedPayload>`
- `senderCiphertexts`: same, so the sender’s other devices can read the message
- Legacy field `ciphertext`: prefers the payload for `deviceId === 1` when present

### Plaintext inside the envelope

`MessageContent` JSON (`packages/crypto/src/content.ts`):

```ts
{ type: "text" | "image" | "video" | "media" | "group_key", text?, image?, video?, media?, groupKey?, ... }
```

### Encrypt flow (sender)

Implemented in `packages/client/src/messages.ts` → `encryptOutgoingMessage` → `VaultDevice.encrypt`:

1. `serializeMessageContent(content)` → UTF-8 JSON string.
2. List recipient device IDs + other own device IDs (`listRecipientDeviceIds` / `listOwnOtherDeviceIds`) — **no OTP consume**.
3. For each device: if `hasOpenSession`, encrypt with the Double Ratchet; else fetch one prekey bundle and run X3DH once.
4. First message to a device is type `3` (PreKey); after the peer replies once, follow-ups are type `1` (Whisper). Pass `forceNewSession: true` only when deliberately resetting.
5. POST `/api/v1/messages` with ciphertext blobs only.
6. Persist local Signal store.

```ts
// packages/crypto/src/device.ts (simplified)
async encrypt(recipientId, recipientDeviceId, plaintext, bundle?, opts?) {
  const hasSession = !opts?.forceNewSession && await this.hasOpenSession(...);
  if (!hasSession) {
    if (!bundle) throw new Error("No session and no prekey bundle provided");
    if (opts?.forceNewSession) await this.resetSession(...);
    await this.establishSession(bundle);
  }
  return messageToPayload(await cipher.encrypt(utf8Plaintext));
}
```

Body encoding: Signal’s Latin-1 binary string is converted to **base64** with `bodyEncoding: "base64"` so ciphertext is UTF-8-safe in the DB.

### Decrypt flow (receiver)

`decryptEnvelope` in `packages/client/src/messages.ts`:

1. Prefer sealed plaintext cache (`getCachedMessage`) — **required** because Signal message keys are one-shot (both PreKey and Whisper).
2. Pick **only** `recipientCiphertexts[myDeviceId]` (or legacy `ciphertext`) — never try other devices’ copies.
3. `device.decrypt(senderId, senderDeviceId, payload)`:
   - type `3` → `decryptPreKeyWhisperMessage`
   - type `1` → `decryptWhisperMessage` (no session wipe on failure)
4. `parseMessageContent` → UI; on success, `cacheDecryptedMessage` (sealed vault).

Decoder also treats bodies matching a base64 regex as base64 when `bodyEncoding` is missing (legacy).

---

## Groups & channels (shared AES)

Not Signal Sender Keys. Design:

1. Admin runs `GroupCipher.generate()` → AES-256-GCM raw key (base64).
2. Key stored client-side at `vaultchat_group_keys_${userId}` as a **plaintext JSON map** (not sealed).
3. Message wire format:

```json
{"n":"<base64 12-byte nonce>","c":"<base64 AES-GCM ciphertext>"}
```

Plaintext is again `serializeMessageContent(...)`.

4. Key distribution: for each other member, send a Signal DM with `{ type: "group_key", groupKey: { groupId, key } }` to **every** registered device (`distributeGroupKeyToMember`). Admin’s other devices get a self-DM sync (`syncGroupKeyToOwnDevices`).
5. Channel messages reuse the **same community AES key** (`loadGroupCipher(..., communityId)`).
Key files: `packages/crypto/src/group.ts`, `packages/client/src/group-admin.ts`, `group-keys.ts`, `group-messages.ts`, `channel-messages.ts`.

---

## Media attachments

`packages/crypto/src/media.ts`:

1. Random AES-256-GCM key + 12-byte nonce.
2. Encrypt file bytes; upload **ciphertext** to object storage (R2 / media API).
3. Put `key`, `nonce`, `mediaId`, mime, size inside the E2EE `MessageContent.media`.
4. Download ciphertext; decrypt with key/nonce from the decrypted message.

Client wrappers: `packages/client/src/media.ts` (`uploadEncryptedMedia`, `downloadEncryptedMedia`). Small images may instead be base64-inlined inside the Signal/group payload (`attachments.ts`).

---

## Local sealed vault

`packages/client/src/local-vault.ts`:

- Per-user AES-256-GCM key stored via the platform `StorageAdapter` (`vaultchat_vault_key_${userId}`).
- Seals decrypted message cache so history can be shown without re-decrypting PreKey messages.
- Format: `{"v":1,"n":"...","c":"..."}`.

**Group AES keys are not sealed** — only the DM plaintext cache uses the vault.

---

## Account key backup

`packages/crypto/src/backup.ts` + `packages/client/src/key-backup.ts`:

- Password → PBKDF2 (310_000, SHA-256, 16-byte salt) → AES-256-GCM.
- **v2 payload:** Signal device stores **plus** message cache, conversation timelines, and group AES keys.
- Uploaded on login, after send/sync (debounced), and on logout.
- **Restored on every login** (even when local keys already exist).
- Merge is a **union** — a new empty device never wipes remote history.
- Server stores the opaque blob only (`packages/api-core/src/key-backup.ts`).

---

## Backend (no message decryption)

The API and gateway **never** run Signal or AES decrypt on chat content.

| Concern | What happens | Where |
|---------|--------------|--------|
| Message / group / channel storage | Opaque ciphertext strings (max ~131_072 chars for DMs) | `packages/api-core/src/messages.ts`, `groups.ts`, `channels.ts` |
| Public key directory | `devices`, `signed_pre_keys`, `one_time_pre_keys` (public only) | `packages/api-core/src/users.ts` |
| Prekey fetch | Marks one OTP as used; returns bundle | `getPreKeyBundle` |
| Prekey upload | Verifies signed prekey against identity | `verifyPreKeyBundle` |
| Key backup | Opaque encrypted string | `packages/api-core/src/key-backup.ts` |
| Login password | scrypt hash, not message crypto | `packages/api-core/src/password.ts` |
| Sessions | JWT (`jose`) with `deviceId` claim | `packages/api-core/src/auth.ts` |
| Push | Generic “new encrypted message” text | `packages/api-core/src/push.ts` |
| Gateway | Relays envelopes | `services/gateway` |

---

## Per platform

### Web (`apps/web`)

| Piece | Implementation |
|-------|----------------|
| Crypto APIs | Native browser `crypto.subtle` / `getRandomValues` |
| Signal + AES | `@vaultchat/crypto` (same as all clients) |
| Orchestration | `@vaultchat/client` from UI (`ChatApp`, conversation views, etc.) |
| Key / vault storage | `localStorage` via `createLocalStorageAdapter()` — keys like `vaultchat_device_${userId}` |
| Build notes | Next.js transpiles `@vaultchat/crypto`; libsignal Node `fs` stubbed in `next.config.ts` |

### Desktop (`apps/desktop`)

| Piece | Implementation |
|-------|----------------|
| Runtime | Tauri WebView |
| Crypto | Same Web Crypto + `@vaultchat/crypto` as web |
| Storage | Same `localStorage` adapter |
| Extra | `Buffer` polyfill for bundled deps (`apps/desktop/src/polyfills.ts`) |

No separate Rust/native crypto path for messages.

### Mobile (`apps/mobile`)

| Piece | Implementation |
|-------|----------------|
| Runtime | Expo / React Native |
| Crypto | Same `@vaultchat/crypto`, but **WebCrypto is polyfilled** |
| Polyfill | `apps/mobile/webcrypto-polyfill.js` — libsignal **msrcrypto** as `crypto.subtle` |
| RNG | `react-native-get-random-values` |
| Self-test | `ensureMobileCrypto` / `verifyMobileCrypto` in `apps/mobile/src/lib/mobileCrypto.ts` (libsignal AES-CBC sanity check) |
| Storage | Expo SecureStore, chunked (~1800 chars) — `apps/mobile/src/lib/storage.ts` |

There are **no Swift/Kotlin crypto modules**. Mobile hosts the shared TypeScript Signal + AES stack.

---

## End-to-end flows (summary)

### Send a DM

```
UI → serializeMessageContent
   → list recipient + other own device IDs (no OTP consume)
   → for each device: encrypt with existing session, else fetch bundle + X3DH once
   → POST ciphertext JSON to API
   → persist Signal store locally
```

### Receive a DM

```
WS/API envelope
   → sealed cache hit? show plaintext
   → else pick ciphertext for myDeviceId only
   → VaultDevice.decrypt (PreKey or Whisper)
   → parseMessageContent → UI
   → seal into local vault cache
```

### Send a group/channel message

```
load GroupCipher from local group key map
   → AES-GCM encrypt MessageContent JSON → {"n","c"}
   → POST ciphertext to API
```

### Share a group key

```
GroupCipher.generate → save locally
   → Signal-encrypt { type: "group_key", ... } to each member device
   → sync to own other devices via self-DM
```

### Upload media

```
encryptAttachment (AES-GCM)
   → upload ciphertext blob
   → put key+nonce+mediaId inside DM/group MessageContent
   → encrypt that message as usual
```

---

## Scenario audit & fixes

### Bugs that were fixed

| # | Scenario | What went wrong | Fix |
|---|----------|-----------------|-----|
| 1 | Alice messages Bob repeatedly | Every send called `resetSession` + X3DH when a bundle was passed → always type-3 PreKey, OTP burn, weak ratchet continuity | `VaultDevice.encrypt` reuses an open session; only X3DH when none exists (`forceNewSession` for explicit reset) |
| 2 | Sending to multi-device peers | `fetchRecipientDeviceBundles` / `fetchOwnDeviceBundles` consumed an OTP **per device per send** even with a live session | Call sites list device IDs first; `encryptOutgoingMessage` fetches a bundle only when `hasOpenSession` is false |
| 3 | Sender encrypts a copy for herself | Own-device fan-out included the sending device → wasted OTP / useless self-session | `listOwnOtherDeviceIds` + skip `device.deviceId` in sender copies |
| 4 | Multi-device inbox decrypt | `decryptEnvelope` tried **every** device’s ciphertext; type-1 failure path reset the session → poisoned healthy ratchets | Decrypt only `myDeviceId`’s copy; removed silent type-1 reset+retry (retry could never succeed after wipe) |
| 5 | Member has phone + desktop | Group keys were sent only to **device 1** → secondary devices could not decrypt community history | `distributeGroupKeyToMember` fans out to all recipient device IDs |

### Scenarios that still matter (by design or residual risk)

| Scenario | Behavior | Mitigation / residual risk |
|----------|----------|----------------------------|
| Reinstall / clear site data / new browser | Local Signal store + sealed vault wiped | Password backup **v2** restores keys **and** message cache / timelines / group keys on login |
| Same-device history reload | Signal message keys are one-shot | Sealed plaintext vault (also in v2 backup) |
| Alice sends several PreKeys before Bob replies | Unconfirmed sessions still emit type-3 until Bob replies | Normal Signal; then type-1 |
| Reinstall with **no** usable backup | New linked device — no ciphertext for new `deviceId` | UI explains; new messages work; old history stays on old devices |
| Backup never refreshed since last chat | History in backup may be stale | Refresh on login, after chat sync (debounced), logout flush |
| Identity change / new keys on purpose | `saveIdentity` refuses overwrite | Confirm new safety number; `forceNewSession` |
| Group AES keys | Still plaintext in local storage | Also included in v2 backup now |
| Mobile vs web crypto | Mobile uses msrcrypto polyfill | Same algorithms |

### Encrypt session rules (current)

```
hasOpenSession(peer)?
  yes → encrypt with Double Ratchet (type 1 after session confirmed)
  no  → require prekey bundle → establishSession (X3DH) → encrypt (type 3)
forceNewSession: true → reset + X3DH even if a session exists
```

---

## Quick file index

| Topic | Path |
|-------|------|
| Signal encrypt/decrypt | `packages/crypto/src/device.ts` |
| Group AES | `packages/crypto/src/group.ts` |
| Media AES | `packages/crypto/src/media.ts` |
| Backup | `packages/crypto/src/backup.ts` |
| DM orchestration | `packages/client/src/messages.ts` |
| Account password backup (v2 + history) | `packages/client/src/key-backup.ts`, `packages/crypto/src/backup.ts` |
| Login restore / provision | `packages/client/src/device-auth.ts` |
| Device ID listing (no OTP) | `packages/client/src/api.ts` (`listRecipientDeviceIds`, `listOwnOtherDeviceIds`) |
| Local vault | `packages/client/src/local-vault.ts` |
| Group key share | `packages/client/src/group-admin.ts` |
| Prekeys (server) | `packages/api-core/src/users.ts` |
| Message store (server) | `packages/api-core/src/messages.ts` |
| Password hashing | `packages/api-core/src/password.ts` |
| Mobile polyfill | `apps/mobile/webcrypto-polyfill.js` |
| Mobile crypto gate | `apps/mobile/src/lib/mobileCrypto.ts` |
| Web/desktop storage | `packages/client/src/storage.ts` |
| Mobile storage | `apps/mobile/src/lib/storage.ts` |
