# Audio & Video Calling — Current Implementation

How VaultChat 1:1 voice and video calls work **as implemented today** across the gateway, API, web, desktop (Tauri), and mobile (Expo).

> Calls are custom WebRTC peer-to-peer. There is no LiveKit, mediasoup, or Twilio media server. The server relays **signaling only**; media is DTLS-SRTP between clients (or via TURN when NAT requires it).
>
> Discord-style **voice channels** exist as presence only (`voice_presence`) — they do **not** carry call media yet.

---

## Architecture at a glance

```
┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│  apps/web   │   │ apps/desktop │   │ apps/mobile │
│  (browser)  │   │   (Tauri)    │   │ (Expo RN)   │
└──────┬──────┘   └──────┬───────┘   └──────┬──────┘
       │                 │                  │
       └────────┬────────┴─────────┬────────┘
                │                  │
     useCallSession  +  CallSession
                │
       ┌────────┴────────┐
       │                 │
  WebSocket           HTTP GET
  (signaling)         /api/v1/calls/ice-servers
       │                 │
┌──────▼──────┐   ┌──────▼──────┐
│  Gateway    │   │ Next.js API │
│  calls.ts   │   │ + api-core  │
└──────┬──────┘   └──────┬──────┘
       │                 │
   Redis call         coturn HMAC
   sessions           credentials
       │
       │  POST /api/v1/calls/notify-incoming
       └──────────► Expo push (incoming_call)

Media (not through VaultChat servers):
  Peer A  ←── DTLS-SRTP ──►  Peer B
            (direct or via TURN relay)
```

**There is no per-platform call protocol.** Web, desktop, and mobile all use `@vaultchat/client` (`CallSession`) and `@vaultchat/chat-react` (`useCallSession`). Platforms only differ in WebRTC adapter, permissions, ringtone, and incoming-call UX / push.

| Package / area | Role |
|----------------|------|
| `packages/protocol` | `CallType`, SDP/ICE payloads, WS call event types |
| `packages/client` (`calls/`) | `CallSession` state machine, ICE fetch |
| `packages/chat-react` | `useCallSession`, `useCallRingtone` |
| `packages/api-core` | ICE server response + TURN HMAC; incoming-call push |
| `services/gateway` | WS signaling + Redis call sessions + ring timeout |
| `apps/web` | Browser WebRTC, modals/overlays |
| `apps/desktop` | Same as web + macOS TCC permissions |
| `apps/mobile` | `react-native-webrtc` adapter + Expo push |

---

## Mental model

1. Place call over WebSocket → peer rings over WS (+ optional push on mobile).
2. Accept → both sides open `RTCPeerConnection` and get local media.
3. **Caller** creates the SDP offer; callee answers; both exchange ICE candidates via the gateway.
4. Media flows peer-to-peer (or TURN). Hangup tears down Redis session + WebRTC.

The gateway never sees audio/video plaintext. Signaling (SDP/ICE) is relayed in the clear over the authenticated WS — same trust model as non-E2EE call setup on most messengers.

---

## Call lifecycle

### Phases (`CallSession`)

```
idle → outgoing | incoming → connecting → active → ended → (short delay) → idle
```

### Outbound (A calls B)

1. A: `startOutgoing(B, "voice" | "video")` → generates `callId` (UUID), phase `outgoing`, sends `call_invite`.
2. Gateway: stores Redis session (`ringing`); sends B `call_incoming` if online; fires Expo push; starts **45s** ring timer.
3. B: phase `incoming` (modal / banner / ringtone).
4. B accepts → `call_accept`; B creates peer connection + `getUserMedia`, phase `connecting`.
5. Gateway → A: `call_accepted`.
6. A: creates PC + local media, **`createOffer`**, sends `call_offer`.
7. B: `setRemoteDescription(offer)`, `createAnswer`, sends `call_answer`.
8. A: `setRemoteDescription(answer)`.
9. Both exchange `call_ice` as candidates appear (queued until remote description exists).
10. `ontrack` / `connectionState === "connected"` → phase `active`.
11. Hangup: either side `call_end` → peer gets `call_ended` → stop tracks, close PC, clear Redis.

### Reject / busy / timeout / offline

| Case | Behavior |
|------|----------|
| Reject | `call_reject` → caller gets `call_rejected` |
| Already in a call | New invites auto-rejected with `reason: "busy"` |
| Ring timeout (45s) | Both sides `call_ended` / `no_answer` |
| Callee not on WS | Invite fails; caller gets error + `unavailable` |
| WS disconnect | After **8s** grace, peer gets `call_ended` / `disconnected` |

### Who is the offerer?

**Always the caller** creates the SDP offer after `call_accepted`. The callee only answers.

---

## Signaling protocol

Defined in `packages/protocol`. All call events require a prior WS `auth` with a session JWT.

### Client → gateway

| Event | Payload |
|-------|---------|
| `call_invite` | `{ callId, calleeId, callType }` |
| `call_accept` | `{ callId }` |
| `call_reject` | `{ callId, reason? }` |
| `call_offer` | `{ callId, sdp }` |
| `call_answer` | `{ callId, sdp }` |
| `call_ice` | `{ callId, candidate }` |
| `call_end` | `{ callId }` |

### Gateway → client

| Event | Payload |
|-------|---------|
| `call_incoming` | `{ callId, callerId, callType }` |
| `call_accepted` | `{ callId, peerId }` |
| `call_rejected` | `{ callId, reason? }` |
| `call_offer` / `call_answer` / `call_ice` | Relayed SDP/ICE |
| `call_ended` | `{ callId, reason? }` — e.g. `no_answer`, `unavailable`, `disconnected` |

### Push (mobile)

Payload: `{ type: "incoming_call", callerId, callType, callId }`.

Mobile injects a synthetic `call_incoming` into `CallSession`. Accept and all media signaling still require a live WebSocket.

---

## Backend

### Gateway (`services/gateway`)

| File | Role |
|------|------|
| `src/calls.ts` | `handleCallEvent` — invite/accept/reject/offer/answer/ICE/end, push, ring timeout |
| `src/call-store.ts` | Redis CRUD for call sessions |
| `src/index.ts` | Routes call WS events; cleans up calls on disconnect |

Call state lives in **Redis only** (no Postgres call table):

```ts
interface CallSession {
  callId: string;
  callerId: string;
  calleeId: string;
  callType: "voice" | "video";
  state: "ringing" | "active" | "ended";
}
```

- Keys: `vaultchat:call:{callId}`, membership `vaultchat:call:user:{userId}`
- TTL: **45s** while ringing, **1h** while active (refreshed on offer/answer/ICE via `touchCall`)

“Online” means the callee has an open WebSocket on this gateway process. If `sendToUser` fails, the invite is aborted as unavailable.

### HTTP API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/calls/ice-servers` | Bearer JWT | STUN + time-limited TURN credentials |
| `POST` | `/api/v1/calls/notify-incoming` | `x-gateway-secret` | Gateway → API bridge for Expo push |

There are **no** separate call-room JWTs. Normal session JWT authenticates WS and ICE fetch. TURN uses short-lived HMAC credentials derived from `TURN_SECRET` (see [docs/turn-production.md](docs/turn-production.md)).

### TURN / STUN credentials (`packages/api-core`)

coturn `use-auth-secret` style:

- Username: `{unix_expiry}:{userId}` (24h TTL)
- Credential: `HMAC-SHA1(TURN_SECRET, username)` → base64
- STUN always returned; TURN only if `TURN_URL` is set

---

## Shared client

### `CallSession` (`packages/client/src/calls/CallSession.ts`)

- Injects a `WebRtcAdapter` so React Native can supply `react-native-webrtc` instead of browser globals
- Fetches ICE servers before `new RTCPeerConnection({ iceServers })`
- Local media: `{ audio: true, video: callType === "video" }`
- Mute / camera = enable/disable local tracks
- Queues ICE until remote description is set
- 8s grace on ICE `disconnected` before ending the call
- Dedupes duplicate `call_incoming` for the same `callId`

### `useCallSession` (`packages/chat-react`)

React wrapper exposing phase, streams, `incomingCall`, mute/camera helpers, and `handleServerEvent`. Each app must forward gateway WS events into that handler (web/desktop via vault chat hooks; mobile via call context).

---

## Web (`apps/web`)

| Piece | Role |
|-------|------|
| `ChatApp.tsx` | Wires `useCallSession`, voice/video buttons, forwards WS events |
| `IncomingCallModal.tsx` | Accept / reject |
| `ActiveCallOverlay.tsx` | `<video>` / `<audio>` for local + remote streams |
| `useCallRingtone` | Plays `/sounds/incoming.mp3` |

Uses the browser’s native WebRTC. Needs a secure context (HTTPS or localhost) for `getUserMedia`.

---

## Desktop (`apps/desktop` — Tauri)

Same React calling stack as web (browser WebRTC inside the WebView). Differences:

| Concern | Behavior |
|---------|----------|
| Permissions | macOS TCC via `tauri-plugin-macos-permissions-api` (`ensureDesktopCallPermissions`) before media |
| Denied UX | `MediaPermissionDialog` → open System Settings Privacy panes |
| UI | Desktop-styled `IncomingCallBanner` / `ActiveCallOverlay` |

There is no separate native WebRTC stack on desktop.

---

## Mobile (`apps/mobile`)

| Concern | Implementation |
|---------|----------------|
| WebRTC | `react-native-webrtc` via `getWebRtcAdapter()` in `src/lib/webrtc.ts` |
| Expo Go | **Not supported** — adapter is null; use a custom/dev client build |
| Permissions | iOS Info.plist strings; Android `PermissionsAndroid` before `getUserMedia` |
| UI | `CallContext` / `CallProvider` — global incoming + active modals, `RTCView` |
| Ringtone | `expo-av` (HTML Audio ringtone hook is disabled) |
| Background ring | Expo push `incoming_call` → inject `call_incoming` |
| Call buttons | Conversation header (`app/conversation/[peerId].tsx`) |

Accept still needs the WS connection for signaling; push is a wake-up, not a full offline call path.

---

## Platform comparison

| | Web | Desktop (Tauri) | Mobile (Expo) |
|--|-----|-----------------|---------------|
| WebRTC | Browser APIs | Browser APIs in WebView | `react-native-webrtc` |
| Permissions | Browser prompt | macOS TCC plugin + browser | iOS plist + Android runtime |
| Ringtone | HTML Audio | HTML Audio | expo-av |
| Incoming while app backgrounded | Limited (web push optional) | Same as web | Expo push |
| Build | Normal web | Tauri | **Must prebuild** (not Expo Go) |

---

## Media path

- **1:1 only** — no multi-party SFU today.
- Prefer **direct P2P**; fall back to **coturn TURN** when ICE cannot punch through NAT.
- Server never terminates or inspects media.

Group “voice channel” join/leave APIs track who is present in a channel (`voice_presence`). That is **not** the same as this WebRTC calling stack.

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `STUN_URL` | Comma-separated STUN URLs (default Google STUN) |
| `TURN_URL` | Comma-separated TURN/TURNS URLs |
| `TURN_SECRET` | Shared with coturn `static-auth-secret` |
| `GATEWAY_PUSH_SECRET` | Auth for `notify-incoming` |
| `API_BASE_URL` | Gateway POST target for push |
| `JWT_SECRET` | WS + API auth |
| `REDIS_URL` | Call session store |

Local coturn is in `infra/` / Docker Compose. Production TURN setup: [docs/turn-production.md](docs/turn-production.md). For mobile on LAN, point `TURN_URL` at your machine’s LAN IP, not `localhost`.

---

## Key source files

```
packages/protocol/src/index.ts          # call event types
packages/client/src/calls/CallSession.ts
packages/client/src/calls/ice.ts
packages/chat-react/src/useCallSession.ts
packages/api-core/src/calls.ts
services/gateway/src/calls.ts
services/gateway/src/call-store.ts
apps/web/src/app/api/v1/calls/ice-servers/route.ts
apps/web/src/app/api/v1/calls/notify-incoming/route.ts
apps/web/src/components/chat/ActiveCallOverlay.tsx
apps/web/src/components/chat/IncomingCallModal.tsx
apps/desktop/src/lib/mediaPermissions.ts
apps/desktop/src/components/ActiveCallOverlay.tsx
apps/mobile/src/lib/webrtc.ts
apps/mobile/src/context/CallContext.tsx
```

---

## Limitations (today)

- 1:1 calls only — no group media rooms.
- Callee must establish a WebSocket to complete signaling (push alone is not enough).
- Signaling (SDP/ICE) is not end-to-end encrypted; media is DTLS-SRTP.
- Multi-gateway fanout depends on the same process-local WS map used for other realtime events; Redis holds call metadata but does not route sockets across instances by itself.
