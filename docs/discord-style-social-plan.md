# VaultChat — Discord-Style Social & Groups Plan

> **Status:** Planning only (no implementation in this document)  
> **Goal:** Evolve VaultChat from “username lookup + flat groups” into a Discord-like social model while preserving end-to-end encryption.

---

## 1. How Discord is structured (reference model)

Discord organizes communication in layers:

```
Account
├── Friends list          (relationship graph)
├── Direct Messages (DMs) (1:1 and small group DMs)
└── Servers               (large communities)
    ├── Roles & permissions
    ├── Categories          (visual grouping only)
    └── Channels
        ├── Text channels   (persistent chat history)
        ├── Voice channels  (real-time audio; optional video/stage)
        └── (Forum, Stage, Announcement — variants of text/voice)
```

### 1.1 Friends

| Discord concept | Behavior |
|-----------------|----------|
| **Send friend request** | User A requests User B by username (or mutual server) |
| **Pending / Incoming / Outgoing** | Request states until accepted or declined |
| **Friends list** | Accepted relationships; quick access to DM |
| **Block** | Blocked users cannot DM or see presence |
| **Online / Idle / DND / Invisible** | Presence (optional) |

Friends are **not required** to DM someone on Discord (you can DM anyone who shares a server or allows DMs from non-friends). VaultChat can choose stricter or looser rules.

### 1.2 Direct Messages (1:1)

| Discord concept | Behavior |
|-----------------|----------|
| **DM thread** | One persistent conversation per peer pair |
| **Message history** | Server-stored (Discord is not E2EE) |
| **Calls** | Voice/video from DM header |
| **Group DM** | Ad-hoc multi-user DM (separate from servers) |

### 1.3 Servers (≈ VaultChat “Communities”)

| Discord concept | Behavior |
|-----------------|----------|
| **Server** | Named container owned by a user; has icon, description, rules |
| **Invite link** | `discord.gg/…` — join without being friends |
| **Member list** | Everyone in the server; roles change permissions |
| **Categories** | Collapsible folders in the sidebar (e.g. “GENERAL”, “VOICE”) |
| **Text channel** | Named room; only text; per-channel history |
| **Voice channel** | Join/leave; WebRTC mesh or SFU; no persistent chat log in channel itself |
| **Server settings** | Name, icon, verification level, roles, channels, bans, audit log |

### 1.4 Permissions (simplified)

Discord uses **roles** attached to **channel overwrites**. Common permissions:

- View channel, send messages, attach files, manage messages
- Connect / speak (voice)
- Manage channels, manage server, kick/ban members

For VaultChat MVP of permissions: **owner / admin / moderator / member** with a small fixed matrix is enough before a full role editor.

---

## 2. What VaultChat has today

| Area | Current state |
|------|----------------|
| **1:1 chat** | Username search → open thread; Signal Protocol E2EE; no friends gate |
| **Conversations list** | Derived from message history (no `conversations` table) |
| **Groups** | Flat `groups` + `group_members`; one chat per group (no channels) |
| **Group creation** | Name + comma-separated usernames; creator = admin |
| **Group crypto** | Shared AES-256-GCM key; distributed to members via encrypted 1:1 DMs |
| **Friends** | **None** |
| **Invites** | **None** (must know usernames at create time) |
| **Channels** | **None** |
| **Server settings** | **None** (group name fixed at create) |
| **Calls** | 1:1 WebRTC exists; no voice channels |

**Important constraint:** The server must **never** see plaintext. Any Discord feature that relies on server-side search, moderation of content, or push notification body text must be adapted (metadata-only on server, client-side decrypt).

---

## 3. Proposed VaultChat model (Discord mapping)

We rename concepts for clarity in an E2EE product:

| Discord | VaultChat term | Notes |
|---------|----------------|-------|
| Friend | **Contact** / **Friend** | Mutual accept recommended for privacy |
| DM | **Direct chat** | Same as today; Signal E2EE |
| Server | **Community** (or keep **Server**) | Top-level group container |
| Category | **Channel category** | UI + ordering only |
| Text channel | **Text channel** | Separate ciphertext stream per channel |
| Voice channel | **Voice channel** | WebRTC room scoped to community |
| Server settings | **Community settings** | Metadata + permission policy |
| Invite | **Invite link / code** | Join community without prior friendship |

### 3.1 High-level hierarchy

```
User
├── Friends (optional gate for DMs — configurable)
├── Direct chats (1:1, E2EE Signal)
└── Communities
    ├── Settings (name, icon, description, default permissions)
    ├── Members + roles
    ├── Invites
    └── Channel categories
        └── Channels
            ├── text   → encrypted message log per channel
            └── voice  → live WebRTC (no history, or optional text side-channel)
```

---

## 4. Feature plans

### 4.1 Friends system

**Purpose:** Social graph, discoverability, and optional DM policy (“only friends can message me”).

#### Data model (proposed)

```sql
friend_requests (
  id, from_user_id, to_user_id, status, created_at, responded_at
  -- status: pending | accepted | declined | cancelled
  UNIQUE (from_user_id, to_user_id)
)

friendships (
  user_id_a, user_id_b, created_at
  -- canonical order: user_id_a < user_id_b
  PRIMARY KEY (user_id_a, user_id_b)
)

blocks (
  blocker_id, blocked_id, created_at
  PRIMARY KEY (blocker_id, blocked_id)
)

user_privacy_settings (
  user_id,
  dm_policy  -- everyone | friends_only | nobody
)
```

#### Flows

1. **Send request** — `POST /friends/requests` `{ username }`  
   - Validate not blocked, not already friends, no duplicate pending request.
2. **Accept / decline** — `POST /friends/requests/:id/accept|decline`
3. **List friends** — `GET /friends`
4. **Remove friend** — `DELETE /friends/:userId`
5. **Block** — `POST /blocks` (auto-decline pending requests, hide from search optional)

#### UI (Discord-like)

- **Friends tab** in sidebar: All | Pending | Add Friend
- Add friend: username field (same as today’s “new chat” search)
- Friend row: avatar, username, “Message” button → opens 1:1

#### E2EE note

Friendship is **metadata only** on the server (usernames/IDs). No impact on Signal sessions until user opens a DM.

---

### 4.2 1:1 private chat (evolve current DMs)

**Discord behavior:** Persistent DM per user pair; optional calls; optional “close DM” (hides sidebar entry).

#### Keep from today

- Signal Protocol per device
- Username (or friend list) to start chat
- `messages` table stores ciphertext only
- WebSocket `message` event for realtime

#### Add (phased)

| Feature | Server | Client | Phase |
|---------|--------|--------|-------|
| **Conversation pin / mute** | `conversation_prefs` table | Local or synced | P2 |
| **DM policy** (friends only) | `user_privacy_settings` | Enforce on send API | P1 |
| **Block** | `blocks` | Hide thread, reject sends | P1 |
| **Message requests** | For non-friends: queue until accepted | Like Discord “Message Request” inbox | P2 |
| **Multi-device** | Multiple `devices` per user; fan-out ciphertext | Encrypt per device or sync keys | P3 |
| **Disappearing messages** | Optional TTL metadata | Client-enforced | P4 |

#### Proposed `conversation_prefs` (optional)

```sql
conversation_prefs (
  user_id, peer_id,
  pinned, muted_until, archived,
  PRIMARY KEY (user_id, peer_id)
)
```

No change to E2EE payload format for basic text.

---

### 4.3 Communities (Discord “Servers”)

Replace flat **groups** with a **community** container that owns **channels**.

#### Data model (proposed)

```sql
communities (
  id, name, description, icon_url,
  owner_id, created_at,
  -- settings: discoverable, default_member_role, etc.
)

community_members (
  community_id, user_id, role, joined_at
  -- role: owner | admin | moderator | member
)

channel_categories (
  id, community_id, name, position
)

channels (
  id, community_id, category_id,  -- category_id nullable = uncategorized
  name, type, position, created_at,
  -- type: text | voice | announcement (subset for MVP)
  topic,  -- encrypted or plaintext? recommend plaintext short topic only
  slow_mode_seconds,
  archived
)

channel_messages (
  id, channel_id, sender_id, sender_device_id,
  ciphertext, message_type, created_at
  -- same shape as group_messages but keyed by channel_id
)

invites (
  code, community_id, created_by,
  max_uses, uses, expires_at,
  grants_role
)
```

**Migration path:** Rename/refactor existing `groups` → `communities` with a default `#general` text channel per legacy group.

#### Creation flow (Discord-like)

1. User clicks **Create Community**
2. Wizard: name, icon (optional), invite friends OR generate invite link
3. Server creates:
   - `communities` row
   - creator as `owner`
   - default category “Text channels”
   - default channels: `#general` (text), optionally `#voice` (voice)
4. Client generates **community encryption key material** (see §5)
5. Client distributes keys to initial members via 1:1 Signal messages (existing pattern)

#### Join flow

- **Invite link:** `https://app/invite/{code}` → preview → join → member row + client receives key via admin re-share or key-package DM
- **Added by admin:** same as today’s username list at create time

---

### 4.4 Channel types

| Type | Discord analog | VaultChat behavior | E2EE approach |
|------|----------------|-------------------|---------------|
| **text** | `#general` | Persistent encrypted history | **Per-channel symmetric key** OR per-community key + channel ID in AEAD associated data (see §5) |
| **voice** | Voice channel | WebRTC room ID = `channel_id`; join/leave events | Media encrypted by WebRTC (SRTP); signaling via existing call WS events |
| **announcement** (later) | Announcement channel | Only admins post; members read | Same as text; permission gate on send |
| **stage** (later) | Stage channel | One-to-many speak | Voice + role permissions |

#### Text channel

- Sidebar lists channels under categories
- Selecting channel loads `GET /communities/:id/channels/:channelId/messages`
- Send → `POST` with ciphertext → Redis → WS `channel_message` event (extend protocol)

#### Voice channel

- Discord: click channel → auto-join voice
- VaultChat plan:
  - `POST /channels/:id/voice/join` → returns TURN/ICE + room token
  - Gateway tracks `voice_presence:{channelId}` (user IDs only, not audio)
  - WS events: `voice_join`, `voice_leave`, `voice_speaking` (optional)
  - Reuse existing `CallSession` / WebRTC stack; room = channel
- **No ciphertext stream** for voice (live only); optional text chat still uses text channel

#### Categories

- Ordering via `position` integer
- Drag-and-drop in **Edit Community** → admin API updates positions
- Categories do not affect encryption

---

### 4.5 Edit community / group settings

Discord **Server Settings** tabs → VaultChat equivalent:

| Settings tab | Who | Server stores | Client stores |
|--------------|-----|---------------|---------------|
| **Overview** | Admin+ | name, description, icon URL | — |
| **Channels** | Admin+ | categories, channels CRUD, order | — |
| **Members** | Admin+ | roles, kick, ban | — |
| **Invites** | Admin+ | invite codes, revoke | — |
| **Roles & permissions** | Owner | role definitions, channel overrides | — |
| **Moderation** | Admin+ | ban list, audit log (metadata) | — |
| **Encryption** (VaultChat-specific) | Admin | **no keys** | key rotation UI, re-share to members |

#### APIs (proposed)

```
PATCH  /communities/:id              — overview settings
POST   /communities/:id/categories
PATCH  /communities/:id/categories/:catId
DELETE /communities/:id/categories/:catId
POST   /communities/:id/channels
PATCH  /communities/:id/channels/:chId  — rename, topic, slow mode, move category
DELETE /communities/:id/channels/:chId
POST   /communities/:id/invites
DELETE /communities/:id/invites/:code
PATCH  /communities/:id/members/:userId  — role, kick
POST   /communities/:id/bans
```

#### Key rotation (E2EE)

When admin changes sensitive membership (kick, channel permission on crypto export):

1. Admin client generates new channel or community key
2. Re-share to remaining members via 1:1 Signal (`group_key` / `channel_key` payload types)
3. Old key retired client-side; messages after rotation use new key

Discord does not need this; **we must document it in settings UI**.

---

## 5. Encryption architecture (1:1 vs community channels)

### 5.1 Direct messages (unchanged)

- **Signal Protocol** (Double Ratchet) per peer pair per device
- Server: `devices`, prekeys, `messages.ciphertext`
- Payload: `MessageContent` JSON encrypted

### 5.2 Community text channels (evolve group crypto)

**Today:** one AES key per flat group.

**Recommended for channels:**

```
Option A — One key per community (simpler)
  Encrypt with community master key; include channel_id in plaintext header before encrypt
  Pros: one key distribution per member join
  Cons: all channels same key; leak of key exposes all channels

Option B — One key per text channel (Discord-like isolation) ✅ recommended
  Each text channel has channel_key
  On join: admin sends ChannelKeyBundle via DM for each channel user can view
  Pros: tighter boundary; rotate per channel
  Cons: more key management on join

Option C — Sender Keys / MLS (future)
  True forward secrecy for large groups; significant complexity
```

**MVP recommendation:** **Option B** for text channels; voice uses WebRTC only.

#### Payload extension (protocol)

```typescript
// Inside Signal ciphertext (1:1 key delivery)
{ type: "channel_key", channelKey: { communityId, channelId, key: base64 } }

// Channel message ciphertext (posted to channel_messages)
GroupCipher.encrypt(JSON.stringify({ type: "text", text: "..." }))
// key = channel_keys[channelId]
```

### 5.3 What the server can know (metadata)

| Data | OK on server |
|------|----------------|
| Community name, channel names, member list | Yes |
| Message timestamps, sender ID | Yes |
| Ciphertext | Yes |
| Plaintext, keys | **Never** |

Push notifications: “New message in #general” without body (already similar).

---

## 6. UI / navigation plan (Discord-like)

### 6.1 Layout

```
┌──────────┬─────────────────────┬──────────────────┐
│ Servers  │  Channels (comm.)  │   Chat / Voice   │
│  strip   │  + categories      │   main panel     │
│          │  + member list     │                  │
├──────────┴─────────────────────┴──────────────────┤
│  Home: Friends | DMs                                │
└─────────────────────────────────────────────────────┘
```

- **Home** (Discord top-left): Friends list + DMs (current Chats tab evolves here)
- **Server strip:** one icon per community
- **Channel list:** categories + text/voice icons
- **Member sidebar:** online members (presence phase 2)

### 6.2 Mobile

- Bottom tabs: **Home (DMs)** | **Communities** | **Settings**
- Community view: channel list drawer → channel screen

---

## 7. WebSocket & API event plan

### New server → client events

| Event | When |
|-------|------|
| `friend_request` | Incoming request |
| `friend_accept` | Request accepted |
| `channel_message` | New text channel ciphertext |
| `channel_typing` | Optional |
| `member_join` / `member_leave` | Community membership |
| `channel_updated` | Rename, delete, permission |
| `voice_presence` | Who is in voice channel |

### HTTP remains source of truth

Keep **send via HTTP POST** (today’s pattern); WS for delivery only. Simpler for E2EE (retry, idempotency).

---

## 8. Phased rollout

> **Important:** §11 Phase 0 (scale foundation) should run **before or in parallel with** Phase 1 below. Building channels on today's `listConversations()` full scan will not scale.

### Phase 0 — Scale foundation (see §11.7)

### Phase 1 — Social foundation (4–6 weeks)

- [ ] Friends: request, accept, list, remove
- [ ] Blocks + `dm_policy: friends_only`
- [ ] Migrate **Groups** → **Communities** with single default `#general` channel
- [ ] Invites: create/redeem invite codes
- [ ] Community settings: rename, description, icon
- [ ] Member list: kick, promote to admin

**Deliverable:** Discord-like friends + servers with one text channel each; settings page for community overview.

### Phase 2 — Channels & categories (4–6 weeks)

- [ ] Channel categories (CRUD, reorder)
- [ ] Multiple **text** channels per community
- [ ] Per-channel encryption keys (Option B)
- [ ] Channel settings: name, topic, slow mode
- [ ] WS `channel_message` + UI sidebar

**Deliverable:** Multi-channel text communities like Discord text channels.

### Phase 3 — Voice channels (3–4 weeks)

- [ ] Voice channel type
- [ ] Join/leave presence
- [ ] WebRTC room per voice channel (extend existing call stack)
- [ ] Push-to-talk / mute UI

**Deliverable:** Discord-style voice rooms.

### Phase 4 — Polish (ongoing)

- [ ] Message requests inbox
- [ ] Roles & granular permissions
- [ ] Announcement channels
- [ ] Search (client-side decrypt index only)
- [ ] Sender Keys / MLS evaluation for 50+ member communities

---

## 9. Open product decisions (need answers before build)

1. **DM policy default:** Can anyone DM by username (today), or friends-only by default?
2. **Community discovery:** Public directory vs invite-only only?
3. **Group DMs:** Discord-style multi-user DM (3–10 people) separate from communities?
4. **Channel key strategy:** Option A vs B (this doc recommends B).
5. **Legacy groups:** Auto-migrate to community + `#general` or force recreate?
6. **Voice channel max participants:** Match Discord limits or smaller for MVP WebRTC mesh?

---

## 10. Summary

| Capability | Discord | VaultChat today | Target |
|------------|---------|-----------------|--------|
| Friends | ✅ | ❌ | Phase 1 |
| 1:1 DM | ✅ (not E2EE) | ✅ Signal E2EE | Enhance + policies |
| Servers / communities | ✅ | Flat groups | Phase 1–2 |
| Text channels | ✅ | ❌ (one chat per group) | Phase 2 |
| Voice channels | ✅ | 1:1 calls only | Phase 3 |
| Categories | ✅ | ❌ | Phase 2 |
| Server settings | ✅ | ❌ | Phase 1–2 |
| Invite links | ✅ | ❌ | Phase 1 |
| E2EE | ❌ | ✅ | Keep; document tradeoffs |

VaultChat can mirror Discord’s **information architecture** (friends → DMs → communities → categorized channels → voice) while keeping **keys on devices** and the server as a blind relay. The main engineering cost is not UI—it is **key distribution and rotation** every time membership or channel access changes.

---

## 11. Scalability architecture (hundreds → thousands → millions of messages)

This section validates the Discord-style plan against **real growth**: a few hundred messages per user today, thousands in active communities, and **millions** of ciphertext rows globally. E2EE limits server-side plaintext optimization, but metadata, pagination, and client storage must be designed up front.

### 11.1 Scale targets

| Stage | Users | Msgs / channel | Msgs / user (DMs) | Total DB rows | Priority |
|-------|-------|----------------|-------------------|---------------|----------|
| **Now** | 10–100 | 100–500 | 100–1k | &lt;100k | Correctness, E2EE |
| **Growth** | 1k–10k | 10k–50k | 5k–20k | 1M–10M | Pagination, indexes, conversation index |
| **Scale** | 100k+ | 100k–1M+ | 50k+ | 100M–1B+ | Partitioning, archival, horizontal gateway, client local DB |

**Rule:** Never load unbounded history in one API call or keep all decrypted messages in React state.

### 11.2 Current gaps (fix before channels multiply load)

| Layer | Issue today | Risk at scale |
|-------|-------------|---------------|
| **Backend** | `listConversations()` scans **all** `messages` for a user | O(total messages) per sidebar open |
| **Backend** | No `conversations` / read-state table | Slow sidebar; no cheap unread counts |
| **Backend** | DM thread query uses `OR(sender, recipient)` without pair index | Full scans on busy threads |
| **Backend** | Cursor pagination in API; **clients may not paginate** | Memory spikes |
| **Backend** | Group message → N Redis publishes (one per member) | Hot large communities |
| **Gateway** | In-memory WS map per process | Needs horizontal scale + Redis |
| **Web** | `ChatApp` holds full message arrays in state | Memory + decrypt CPU grows |
| **Web** | No virtualized list | DOM failure at 1k+ rows |
| **Mobile** | No SQLite message store | Cannot handle large local history |
| **All** | Ciphertext in unbounded `text` column | Postgres row bloat |

### 11.3 Backend (scale-safe)

```
Clients ──HTTP POST/GET (cursor)──► Next.js API (stateless, horizontal)
       ──WebSocket────────────────► Gateway (N replicas + Redis pub/sub)
                                           │
                                    Postgres (+ read replicas)
                                    PgBouncer pool
```

**Add `conversations` index table** (denormalized sidebar):

```sql
conversations (
  user_id, peer_id,
  last_message_id, last_message_at,
  PRIMARY KEY (user_id, peer_id)
);
CREATE INDEX conversations_user_last_at_idx ON conversations (user_id, last_message_at DESC);
```

**Channel messages (Phase 2):**

```sql
channel_messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  ciphertext BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX channel_messages_channel_id_id_desc ON channel_messages (channel_id, id DESC);
```

**Pagination contract (all platforms):**

- Keyset only: `?before_id=` + `limit` (default 50, max 100) — **no OFFSET**
- Response: `{ messages, nextCursor, hasMore }`
- Initial open: newest page only; scroll up loads older
- Client `client_message_id` for idempotent sends

**At millions of rows:** monthly partitions on `created_at`; cold ciphertext → S3; read replicas for history GETs.

**Realtime:** publish once to `vaultchat:channel:{id}` instead of per-member fan-out; multi-gateway with sticky sessions.

### 11.4 Web frontend (scale-safe)

```
React UI (virtualized list: react-virtuoso / TanStack Virtual)
    ↓
Message store (Zustand + IndexedDB per thread)
    ↓
Sync: cursor fetch + Web Worker decrypt (not main thread)
    ↓
WS: append single message; never refetch full thread
```

- Virtual list only (~30–50 DOM rows)
- RAM: last 200–500 decrypted per open thread; older in IndexedDB
- Split `ChatApp.tsx` into store + virtualized `MessageList` + sync service

### 11.5 Mobile (scale-safe)

```
FlashList (inverted) → SQLite (expo-sqlite) → cursor sync → SecureStore (keys only)
```

- **SQLite** for message bodies at scale — not SecureStore
- `@shopify/flash-list` for 1k+ messages
- `onEndReached` loads older cursor (same API as web)
- LRU prune decrypted cache; keep ciphertext

### 11.6 Social features at scale

| Feature | Approach |
|---------|----------|
| Friends | Paginate if &gt;100; indexed `friendships` |
| Members | `GET /communities/:id/members?cursor=` |
| Channels | Metadata only in sidebar (&lt;200 per community) |
| Unread | `channel_read_state (user_id, channel_id, last_read_id)` |
| Voice | SFU when &gt;8 participants (mesh for MVP only) |

### 11.7 Revised phases (scale milestones)

**Phase 0 — Scale foundation** (before or parallel with social Phase 1):

- [x] `conversations` table; fix `listConversations()`
- [x] Composite indexes on messages / group_messages (DM thread indexes)
- [ ] Cursor pagination in web + mobile UI
- [ ] Virtualized list (web) + FlashList (mobile)
- [ ] Mobile SQLite cache
- [ ] Payload size cap + `BYTEA` for new tables (ciphertext size cap added for API)

**Exit criteria:** 10k messages in one thread: latest page &lt;2s; sidebar &lt;100ms; no full table scans.

Then proceed with social Phase 1–4 from §8. **Phase 4 (scale tier):** partitioning, replicas, multi-gateway, cold archival, Sender Keys/MLS.

### 11.8 Capacity planning (rough)

| Metric | Order of magnitude |
|--------|-------------------|
| 5M msgs/day × 2 KB | ~10 GB/day ciphertext |
| Year 1 without archive | ~3–4 TB → needs partition + archival |
| Power user local | 50k msgs × 2 KB ≈ 100 MB SQLite (OK) |

### 11.9 Sign-off checklist

**Backend:** no unbounded queries; keyset cursors; indexes match `EXPLAIN ANALYZE`  
**Web:** virtualized list; WS append-only; IndexedDB working set  
**Mobile:** SQLite + FlashList + pagination  
**E2EE:** pagination on ciphertext; decrypt after fetch only  

**Verdict:** The Discord-style product plan is **architecturally sound** for web, backend, and mobile **if Phase 0 ships first**. Without it, channels multiply existing `listConversations()` and in-memory UI bottlenecks.

---

## 12. Related files (current codebase)

| Area | Path |
|------|------|
| DB schema | `packages/db/src/schema.ts` |
| 1:1 messages API | `packages/api-core/src/messages.ts` |
| Groups API | `packages/api-core/src/groups.ts` |
| Group crypto | `packages/crypto/src/group.ts`, `packages/client/src/group-keys.ts` |
| Protocol / WS events | `packages/protocol/src/index.ts` |
| Web chat UI | `apps/web/src/components/chat/ChatApp.tsx` |
| Mobile chats | `apps/mobile/app/chats.tsx` |
| Message API (pagination) | `packages/api-core/src/messages.ts` |
| Group messages API | `packages/api-core/src/groups.ts` |
| Redis pub/sub | `packages/api-core/src/redis.ts` |
| Gateway WS | `services/gateway/src/index.ts` |

---

*Document version: 1.1 — adds cross-platform scalability architecture (backend, web, mobile).*
