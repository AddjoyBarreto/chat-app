# VaultChat — End-to-End Encrypted Messaging

A secure, scalable messaging platform combining **WhatsApp-style private chats** with **Discord-style communities** — where the server never sees your messages, media, or call content.

> **Honest security note:** No app is "unhackable." VaultChat is designed so that even a full server breach cannot decrypt user content. Security comes from math (Signal Protocol), client-side encryption, and a zero-knowledge server — not from marketing claims.

---

## Table of Contents

- [Vision](#vision)
- [Why This Exists](#why-this-exists)
- [Core Security Model](#core-security-model)
- [Architecture Overview](#architecture-overview)
- [Tech Stack (Cost-Optimized)](#tech-stack-cost-optimized)
- [Deployment Strategy (v0 / Vercel → Self-Hosted Scale)](#deployment-strategy-v0--vercel--self-hosted-scale)
- [MVP Scope](#mvp-scope)
- [Post-MVP Features](#post-mvp-features)
- [Scaling to 1M+ Users](#scaling-to-1m-users)
- [Project Structure](#project-structure)
- [Development Phases](#development-phases)
- [Threat Model](#threat-model)
- [Cost Estimate](#cost-estimate)
- [Getting Started (When We Build)](#getting-started-when-we-build)

---

## Vision

| Layer | Inspiration | What we take |
|-------|-------------|--------------|
| **UX** | WhatsApp | Clean 1:1 and group chats, familiar mobile-first design |
| **Communities** | Discord | Servers, channels, roles — added after MVP |
| **Security** | Signal | Signal Protocol, forward secrecy, verified keys |

The server is a **dumb relay**: it routes encrypted blobs and connection metadata. It cannot read messages, view media, or listen to calls.

---

## Why This Exists

Major platforms have weakened or removed E2EE (or never had it for DMs). VaultChat treats privacy as the default:

- Messages encrypted **on your device** before they leave
- Media encrypted **before upload** — storage only holds ciphertext
- Voice/video encrypted **peer-to-peer** via WebRTC (DTLS-SRTP)
- Server operators, cloud providers, and attackers with DB access see **nothing useful**

---

## Core Security Model

### Cryptography (industry standard — do not roll your own)

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (your phone)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Identity Key │  │ Signed PreKey│  │ One-Time PreKeys │  │
│  │   (long-term)│  │              │  │                  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │             │
│         └─────────────────┼────────────────────┘             │
│                           ▼                                  │
│              Signal Protocol (libsignal)                     │
│         ┌─────────────────────────────────────┐              │
│         │ X3DH — initial key agreement        │              │
│         │ Double Ratchet — every message      │              │
│         │   gets fresh keys (forward secrecy) │              │
│         └─────────────────────────────────────┘              │
│                           │                                  │
│         Plaintext ──► Encrypt ──► Ciphertext ──► Network     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              SERVER (zero-knowledge relay)                   │
│  Stores: public keys, encrypted envelopes, encrypted blobs   │
│  Never has: private keys, message plaintext, media keys      │
└─────────────────────────────────────────────────────────────┘
```

| Property | How we achieve it |
|----------|-------------------|
| **End-to-end encryption** | Signal Protocol (X3DH + Double Ratchet) via `libsignal` |
| **Forward secrecy** | New message keys per send; old keys deleted |
| **Break-in recovery** | Compromised key only affects limited window |
| **Media privacy** | AES-256-GCM per attachment; key inside encrypted message |
| **Call privacy** | WebRTC with DTLS-SRTP; signaling over encrypted channel |
| **Key verification** | Safety numbers / QR compare (like Signal) |
| **Group chats (MVP)** | Sender Keys (Signal group protocol) |

### What the server is allowed to know

- Username, public keys, device list
- Who messaged whom (metadata) — *minimize and consider sealed-sender later*
- Encrypted payload sizes and timestamps
- Push notification tokens (no message content in push body)

### What the server must never know

- Private keys (stay on device; optional secure enclave)
- Message plaintext
- Media decryption keys or unencrypted files
- Call audio/video streams (P2P when possible)

---

## Architecture Overview

```
                         ┌──────────────┐
                         │   Clients    │
                         │ iOS / Android│
                         │  Web (PWA)   │
                         └──────┬───────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
     ┌────────────┐     ┌────────────┐     ┌────────────┐
     │  REST API  │     │ WebSocket  │     │  WebRTC    │
     │  (Go)      │     │  Gateway   │     │  Signaling │
     └─────┬──────┘     └─────┬──────┘     └─────┬──────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │ PostgreSQL │    │   Redis    │    │ Cloudflare │
    │ (metadata) │    │ (presence, │    │ R2 (encrypted│
    │            │    │  sessions) │    │  media blobs)│
    └────────────┘    └────────────┘    └────────────┘
                              │
                              ▼
                    ┌────────────────┐
                    │ coturn (TURN)  │
                    │ NAT traversal  │
                    │ for calls      │
                    └────────────────┘
```

### Message flow (1:1 text)

1. Alice fetches Bob's **prekey bundle** from the key directory
2. Alice's client runs **X3DH** → shared secret → **Double Ratchet** session
3. Alice encrypts text → ciphertext + ratchet header
4. Server stores ciphertext in DB, pushes notification (generic: "New message")
5. Bob's client decrypts locally

### Media flow (image / video / GIF)

1. Client generates random **AES-256 key** + nonce
2. File encrypted locally → upload **ciphertext** to object storage (R2)
3. AES key + file metadata encrypted inside the Signal message envelope
4. Recipient downloads blob, decrypts with key from message

### Voice & video calls

1. **Signaling** (offer/answer/ICE) exchanged via encrypted chat channel or dedicated signaling WebSocket
2. **Media** flows **peer-to-peer** over WebRTC (encrypted by DTLS-SRTP)
3. If P2P fails (symmetric NAT, etc.) → relay through **TURN** (coturn); TURN sees encrypted SRTP only, not raw audio/video
4. Optional: **insertable streams** / frame encryption for extra E2EE layer (post-MVP hardening)

---

## Tech Stack (Cost-Optimized)

Chosen for **free tiers**, proven security libraries, and horizontal scale.

| Layer | Choice | Why | Free tier |
|-------|--------|-----|-----------|
| **Mobile + Web** | React Native (Expo) + Next.js PWA | One codebase mindset; large ecosystem | Expo free |
| **Crypto** | `@privacyresearch/libsignal-protocol-typescript` or native `libsignal` bindings | Battle-tested Signal Protocol | Open source |
| **API (MVP)** | **Next.js API routes** on Vercel (from v0 export) | Free deploy, v0-native, fast iteration | Vercel Hobby free |
| **API (scale)** | **Go** (Fiber or Chi) — same DB schema, same REST contract | Long-lived connections, low memory at 1M+ users | Fly.io / VPS |
| **Realtime** | WebSocket gateway (small always-on service) | Message delivery, presence; **not** Vercel serverless | Fly.io / Render |
| **Database** | **PostgreSQL** (Neon or Supabase) | Reliable, JSONB for envelopes | Neon 0.5GB free |
| **Cache** | **Redis** (Upstash) | Sessions, rate limits, presence | 10k cmds/day free |
| **Object storage** | **Cloudflare R2** | No egress fees; S3-compatible | 10 GB/month free |
| **CDN / DDoS** | **Cloudflare** | Free SSL, WAF basics, CDN | Free plan |
| **TURN/STUN** | **coturn** on Fly.io | Voice/video NAT traversal | Fly free allowance |
| **Push** | FCM + APNs | Standard; no message content in payload | Free |
| **Auth (metadata)** | Custom + device keys; optional Clerk for email verify only | Keys never leave client | Clerk free tier |
| **CI/CD** | GitHub Actions | Build, test, deploy | 2000 min/month free |
| **Monitoring** | Grafana Cloud free / Sentry free | Errors and uptime | Free tiers |

**Avoid early:** paid Kafka, managed Kubernetes, multiple regions — add when metrics demand it.

---

## Deployment Strategy (v0 / Vercel → Self-Hosted Scale)

### What v0 and Vercel are (and are not)

**[v0](https://v0.app)** is Vercel's AI builder — great for generating the **web UI** and **Next.js API route** skeleton. One-click deploy lands on **Vercel**, not a separate "V0 server."

| Component | v0 + Vercel | Notes |
|-----------|-------------|-------|
| Web chat UI (PWA) | ✅ Ideal | Build in v0, sync to GitHub, deploy to Vercel |
| REST API (keys, users, message envelopes) | ✅ Good for MVP | Next.js Route Handlers or Server Actions |
| PostgreSQL (Neon) | ✅ Works | Use `@neondatabase/serverless` — no TCP from serverless |
| Redis (Upstash) | ✅ Works | HTTP-based Upstash client — serverless-friendly |
| Media storage (R2) | ✅ Works | Presigned URLs from API routes |
| **WebSockets** (live message delivery) | ❌ Poor fit | Vercel functions are short-lived; not a persistent WS server |
| **WebRTC signaling** (calls) | ⚠️ Partial | REST/long-poll on Vercel OK for MVP; dedicated service later |
| **TURN server** (coturn) | ❌ Not on Vercel | Needs a small VPS / Fly.io / Render instance |

**Bottom line:** v0 + Vercel is a solid **MVP backend for ~80% of the work**. You still need **one small always-on service** for WebSockets (and later TURN for calls). That is normal — even Signal does not run everything on serverless.

### Recommended MVP layout (cheap, scales later)

```
┌─────────────────────────────────────────────────────────────┐
│  v0 → GitHub → Vercel                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  apps/web (Next.js)                                  │   │
│  │    • Chat UI (v0-generated, you refine)              │   │
│  │    • /api/* REST — users, keys, messages, media URLs │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐     ┌──────────┐     ┌──────────┐
   │   Neon   │     │ Upstash  │     │    R2    │
   │ Postgres │     │  Redis   │     │  media   │
   └──────────┘     └──────────┘     └──────────┘

┌─────────────────────────────────────────────────────────────┐
│  Fly.io / Render (free or ~$5/mo) — separate from Vercel    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  services/gateway (Node or Go WebSocket)             │   │
│  │    • Push encrypted envelopes to online clients      │   │
│  │    • Presence (online / typing)                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Mobile: Expo app talks to same REST + WS URLs (env vars)   │
└─────────────────────────────────────────────────────────────┘
```

### How we avoid rewriting code when scaling

The trick is **separating business logic from hosting** from day one:

```
packages/
  protocol/     ← Message envelope types, API contracts (shared by web + mobile)
  db/           ← Drizzle schema + queries (no Vercel imports)
  api-core/     ← Handlers: registerUser, uploadPreKeys, storeMessage, fetchInbox
                  Pure functions: (db, redis) → result
                  Called by Next.js routes today, Go/Node server tomorrow

apps/web/
  app/api/      ← Thin wrappers: parse request → call api-core → return JSON
                  ~5 lines per endpoint — disposable when you migrate

services/gateway/
  ← Only WebSocket fan-out; reads same Redis/Postgres; no business logic duplication
```

| Rule | Why it matters |
|------|----------------|
| **All clients use `API_BASE_URL` + `WS_URL` env vars** | Swap Vercel → Fly by changing DNS, not app code |
| **REST contract is versioned** (`/api/v1/...`) | Mobile, web, and future Go service stay compatible |
| **DB access only in `packages/db`** | Move off serverless by adding connection pooling — queries unchanged |
| **No Vercel-specific logic in `api-core`** | No `import { headers } from 'next/headers'` in shared code |
| **Gateway only delivers ciphertext** | Same WS protocol whether 10 or 1M users |
| **Dockerfile per service from Phase 0** | `docker build services/gateway` works on any host |

### Migration path (no big bang)

| Stage | Users | REST API | Realtime | Calls (TURN) |
|-------|-------|----------|----------|--------------|
| **MVP** | 0–10k | Vercel (Next.js) | `services/gateway` on Fly free | Signaling via REST; defer TURN |
| **Growth** | 10k–100k | Same, or extract to `services/api` (Go) on Fly | Scale gateway replicas | coturn on Fly |
| **Scale** | 100k–1M+ | Go API fleet behind Cloudflare | WS cluster + Redis pub/sub | TURN pool |

**Extracting REST from Vercel to Go** (when needed): copy SQL from `packages/db`, reimplement handlers in Go using the same JSON shapes — clients do not change. Typical effort: days, not months, because the contract was frozen early.

### What to build in v0 vs by hand

| Build in v0 | Build by hand (do not trust AI for these) |
|-------------|---------------------------------------------|
| Chat list, conversation bubbles, call screens | `packages/crypto` — Signal Protocol |
| Settings, safety numbers UI | `packages/api-core` — envelope storage |
| API route *stubs* wired to Neon | WebSocket gateway protocol |
| shadcn/ui components | Media encrypt-before-upload pipeline |

### MVP cost on Vercel stack

| Service | Cost |
|---------|------|
| Vercel Hobby | $0 |
| v0 (UI generation) | $0–20/mo (optional Pro) |
| Neon | $0 |
| Upstash Redis | $0 |
| Fly.io (gateway only) | $0–7 |
| Cloudflare R2 | $0 |
| **Total** | **~$0–27/mo** |

---

## MVP Scope

**Goal:** Ship a secure WhatsApp-like experience. No Discord servers yet.

### In scope

| Feature | Details |
|---------|---------|
| **Registration** | Phone or email + device key generation; backup key export (optional, user responsibility) |
| **1:1 messaging** | Text with read receipts (encrypted receipt payloads) |
| **Group messaging** | Up to ~50 members; Sender Keys E2EE |
| **Media** | Images, videos, GIFs — client-side encrypt before upload |
| **Voice calls** | 1:1 WebRTC |
| **Video calls** | 1:1 WebRTC |
| **Key verification** | Safety numbers screen |
| **Push notifications** | Generic alerts only |
| **Contact discovery** | Username search (no contact upload in MVP) |

### Out of scope (MVP)

- Discord-style servers / channels
- Voice channels (always-on rooms)
- Bots, integrations, stickers store
- Message editing / disappearing messages (v1.1)
- Multi-device sync (complex; plan for v1.1 with linked devices)
- Federated / decentralized network

### MVP screens (WhatsApp-inspired)

```
┌─────────────────────────────────────┐
│  Chats          🔍  ⋮               │
├─────────────────────────────────────┤
│  👤 Alice          Hey, secure!  2m │
│  👥 Team (3)       📷 Photo      1h │
│  👤 Bob            🔒 Verified   3h │
├─────────────────────────────────────┤
│         [ New chat ]                │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ← Alice          🔒 Verified  📞 📹│
├─────────────────────────────────────┤
│                    Encrypted bubble │
│  Encrypted bubble                   │
│                    📷 [image]       │
├─────────────────────────────────────┤
│  Type a message...            Send  │
└─────────────────────────────────────┘
```

---

## Post-MVP Features

### Phase 2 — Discord-like communities

| Feature | E2EE approach |
|---------|---------------|
| **Servers** | Server metadata on server; channel keys distributed to members |
| **Text channels** | Per-channel **Sender Keys**; rotate on member join/leave |
| **Voice channels** | Selective Forwarding Unit (SFU) with **MLS** or per-room keys (hard; Phase 2b) |
| **Roles & permissions** | Server-side policy on *who can join key group*; keys still client-held |
| **Threads** | Sub-channel key derivation |
| **Reactions / mentions** | Encrypted event payloads |

> **Reality check:** Discord-style always-on voice with full E2EE is one of the hardest problems in secure messaging. MVP calls are 1:1 P2P; voice *channels* may need an SFU (e.g. LiveKit self-hosted) with layered encryption in a later phase.

### Phase 3 — Polish & trust

- Disappearing messages
- Linked devices (multi-device sync)
- Sealed sender (hide sender from server metadata)
- Desktop apps (Electron or Tauri)
- Open-source client + reproducible builds
- Third-party security audit
- Transparency report

### Phase 4 — Growth

- Stickers (encrypted packs)
- Status / stories (encrypted, ephemeral)
- File sharing (large docs)
- Moderation tools (report ciphertext hashes only — limited without server decryption)

---

## Scaling to 1M+ Users

> **Detailed plan:** See [`docs/discord-style-social-plan.md`](docs/discord-style-social-plan.md) §11 for the full cross-platform scalability review (backend, web, mobile) from hundreds of messages per thread through millions of rows globally.

### Message volume (hundreds → thousands → millions)

The product plan is sound **if client pagination and a conversation index ship before Discord-style channels multiply load**.

| Stage | Messages | What must work |
|-------|----------|----------------|
| **Now** | 100–1k per user | Correctness, E2EE, cursor API |
| **Growth** | 10k–50k per channel | Keyset pagination in UI, indexes, `conversations` sidebar table |
| **Scale** | 100k–1M+ per channel | Partitioning, read replicas, cold archival, local client DB |

**Current gap (fix first):** `listConversations()` in `packages/api-core/src/messages.ts` scans all messages for a user — O(total messages) per sidebar open. Add a denormalized `conversations` table before scaling social features.

### Client architecture at scale

| Platform | Requirement |
|----------|-------------|
| **Backend** | Keyset cursors only (`before_id` + `limit`); no OFFSET; composite indexes on `(channel_id, id DESC)` and DM thread pairs |
| **Web** | Virtualized message list (e.g. react-virtuoso); IndexedDB cache; decrypt in Web Worker; WS append-only (no full refetch) |
| **Mobile** | SQLite message store (not SecureStore); FlashList; same cursor pagination as web |
| **Gateway** | Redis pub/sub per channel/thread; horizontal replicas with sticky sessions |

**Rule:** Never load unbounded history in one API call or keep all decrypted messages in React state.

### Principles

1. **Stateless API** — scale Go instances behind Cloudflare load balancer
2. **WebSocket sharding** — sticky sessions or Redis pub/sub for cross-node delivery
3. **DB** — connection pooling (PgBouncer); read replicas when needed
4. **Media** — R2 + Cloudflare CDN; clients upload direct with presigned URLs
5. **No server-side decryption** — CPU stays low; you're moving ciphertext

### Rough capacity (single region, tuned)

| Resource | ~Capacity | Notes |
|----------|-----------|-------|
| Go API (2× 1 vCPU) | 5–10k req/s | Mostly key fetch + envelope store |
| WebSocket nodes | 50–100k concurrent / node | Depends on heartbeat interval |
| PostgreSQL (Neon scale) | Millions of rows | Messages table partitioned by time |
| R2 | Petabytes | Pay only storage; MVP stays in free/low tier |

### When you hit limits

| Milestone | Action |
|-----------|--------|
| 100k DAU | Add WS second node, Redis cluster |
| 500k DAU | DB read replica, message table partitioning |
| 1M+ DAU | Multi-region API, dedicated TURN pool, consider NATS cluster |

### Rate limiting & abuse (free)

- Cloudflare rate limiting
- Redis token bucket per IP / user
- CAPTCHA on signup (Cloudflare Turnstile — free)

---

## Project Structure

```
chat-app/
├── apps/
│   ├── mobile/          # React Native (Expo) — primary client
│   ├── web/             # Next.js PWA — v0 UI + thin /api routes (Vercel)
│   └── desktop/         # (Phase 3) Tauri wrapper
├── packages/
│   ├── crypto/          # Signal wrapper, media encrypt helpers
│   ├── protocol/        # Message envelope types, API contracts
│   ├── db/              # Drizzle schema + queries (hosting-agnostic)
│   ├── api-core/        # Business logic — used by Vercel routes & later Go
│   └── ui/              # Shared chat components
├── services/
│   ├── api/             # (Phase: scale) Go REST — drop-in replacement for Vercel /api
│   ├── gateway/         # WebSocket — always-on (Fly/Render), not Vercel
│   ├── signaling/     # WebRTC signaling server
│   └── turn/            # coturn config + deploy
├── infra/
│   ├── docker/          # Local dev compose
│   ├── fly/             # Fly.io configs
│   └── migrations/      # SQL migrations
├── docs/
│   ├── discord-style-social-plan.md  # Discord UX + scalability architecture (§11)
│   ├── security.md      # Threat model detail
│   └── protocol.md      # Wire format spec
└── README.md
```

---

## Development Phases

### Phase 0 — Foundation (2–3 weeks)

- [x] Monorepo setup (pnpm + turborepo)
- [x] `packages/crypto` — libsignal integration, key generation, encrypt/decrypt roundtrip tests
- [x] `packages/db` + `packages/api-core` — schema and handlers (hosting-agnostic)
- [x] `apps/web` — Next.js on Vercel with thin `/api/v1/*` routes calling `api-core`
- [x] `services/gateway` — minimal WebSocket server (Dockerfile + Fly deploy)
- [x] PostgreSQL schema — users, devices, prekeys, messages (ciphertext only)

### Phase 1 — Messaging MVP (4–6 weeks)

- [x] 1:1 text send/receive over WebSocket (web `/chat` page)
- [x] Web UI — WhatsApp-style chat list, conversation, safety numbers
- [x] Inline image messages (E2EE, &lt;500 KB MVP)
- [x] Mobile UI (Expo) — register, chats, groups, safety numbers
- [x] Web groups tab — create, list, encrypted group chat
- [x] R2 media storage — large encrypted uploads (web + mobile; local fallback without R2)
- [x] Push notifications (Expo Push / generic alerts)
- [x] Group chat (shared AES key via E2EE key distribution; mobile UI)
- [x] R2 media storage + local dev fallback (large encrypted attachments)
- [ ] Sender Keys (full MLS-style group encryption — future)

### Phase 2 — Calls (3–4 weeks)

- [x] WebRTC signaling service (gateway call events + ICE endpoint)
- [x] coturn deployment (local Docker via `infra/docker`)
- [x] 1:1 voice call UI + flow (web + mobile dev build)
- [x] 1:1 video call UI + flow (web; mobile voice-first MVP)
- [x] Call notifications / incoming call screen (WS + Expo push on ring)

### Phase 3 — Hardening (2–3 weeks)

- [ ] Security review checklist
- [ ] Certificate pinning (mobile)
- [ ] Secure storage (Keychain / Keystore)
- [ ] Logging audit — ensure zero plaintext in logs
- [ ] Load test — 10k concurrent WS connections

### Phase 4 — Discord features (ongoing)

> Prerequisite: **message scale foundation** — see plan doc §11.7.

- [x] Scale foundation — `conversations` table, API pagination, ciphertext caps
- [x] Client pagination + virtualized DM list (web: react-virtuoso)
- [ ] Mobile SQLite message cache + FlashList (pagination added; SQLite stub via expo-sqlite dep)
- [x] Friends: request, accept, list, remove + blocks + DM policy
- [x] Invites: create/redeem
- [x] Communities API (groups → communities) + settings (rename, kick, promote)
- [x] Channel categories + text/voice channels + channel messages API
- [x] Voice channel join/leave + presence API
- [ ] Per-channel encryption keys (Option B) — protocol types added; client distribution TBD
- [ ] Full channel chat UI (web sidebar scaffold; use #general group chat for E2EE today)
- [ ] Roles & granular permissions beyond admin/member

---

## Threat Model

| Threat | Mitigation | Residual risk |
|--------|------------|---------------|
| Server DB breached | Only ciphertext stored | Metadata (who talked to whom) exposed |
| Network MITM | TLS 1.3 + cert pinning | Compromised device CAs rare |
| Stolen phone | OS keystore + optional app PIN | Physical access with unlocked device |
| Malicious client update | Reproducible builds, signed releases | User must verify signatures |
| Quantum (future) | Plan PQ migration path (Signal PQXDH) | Long-term archival at risk |
| TURN server | Sees encrypted SRTP only | Traffic analysis timing/metadata |

**We do not claim:** protection against malware on the user's device, compelled key disclosure, or screenshots by the recipient.

---

## Cost Estimate

### MVP / early stage (0–50k users) — **~$0–27/month**

| Service | Cost |
|---------|------|
| Vercel (REST + web UI) | $0 (Hobby) |
| Neon PostgreSQL | $0 (free tier) |
| Upstash Redis | $0 (free tier) |
| Cloudflare R2 | $0–5 |
| Fly.io (WebSocket gateway only) | $0–7 |
| Cloudflare CDN/WAF | $0 |
| FCM / APNs | $0 |
| Domain | ~$12/year |

### At 1M registered users (not all active)

| Service | Est. monthly |
|---------|--------------|
| DB (Neon scale / Supabase Pro) | $25–100 |
| Fly.io / compute | $100–300 |
| R2 storage (encrypted media) | $50–200 |
| TURN bandwidth | $50–150 |
| **Total** | **~$225–750/mo** |

Still far below running decryptable media through proprietary cloud AI/scanning pipelines.

---

## Getting Started

### Prerequisites

- Node.js 20+, pnpm 10+
- Docker Desktop (Postgres, Redis, coturn)
- Expo CLI (mobile, optional)

### Local development

```bash
pnpm install
pnpm setup                    # builds workspace packages + creates .env if missing

pnpm infra:up && pnpm infra:wait
cp .env.example .env          # set JWT_SECRET (required)
DATABASE_URL=postgres://vaultchat:vaultchat@localhost:5432/vaultchat pnpm db:migrate

pnpm dev:stack                # web (:3000) + gateway (:3001) — reads repo-root .env

# Open http://localhost:3000/chat — register two users and chat
pnpm demo                     # optional E2EE API roundtrip test
```

**Mobile on a real device:** set `apps/mobile/app.json` → `extra.apiBaseUrl` and `extra.wsUrl` to your machine's LAN IP (not `localhost`). For calls, also set `TURN_URL=turn:<LAN_IP>:3478` in `.env`. Calls need `npx expo prebuild && npx expo run:ios` (not Expo Go).

**Media:** Small images (&lt;500 KB) are inlined in the E2EE message. Larger images and videos are client-encrypted and uploaded to R2 (or local `.data/media/` without R2 env vars).

**Groups:** Available on web (Groups tab) and mobile (`/groups`).

### Run tests

```bash
pnpm crypto:test    # Signal Protocol encrypt/decrypt roundtrip
pnpm build          # Build all packages
```

### Environment variables (planned)

```env
DATABASE_URL=postgres://...
REDIS_URL=redis://...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=vaultchat-media
TURN_URL=turn:turn.example.com:3478
TURN_SECRET=...
JWT_SECRET=...          # metadata auth only; not message keys
API_BASE_URL=https://your-app.vercel.app
WS_URL=wss://gateway.your-app.fly.dev
```

---

## Design principles

1. **Use Signal Protocol** — never invent custom crypto
2. **Encrypt first, upload second** — media and messages alike
3. **Minimize metadata** — sealed sender and private contact discovery later
4. **Open source clients** — trust through transparency
5. **Boring infrastructure** — Postgres, Go, Redis scale predictably
6. **Free tiers first** — prove product before spend

---

## License

TBD — recommend **AGPL-3.0** for server components and **MIT** for client crypto wrappers to encourage audits.

---

## Next step

Start with **Phase 0**: monorepo + `packages/crypto` proof-of-concept, then scaffold `apps/web` (optionally UI from **v0**) on Vercel and a tiny `services/gateway` on Fly. That validates crypto and deployment split before mobile work.
