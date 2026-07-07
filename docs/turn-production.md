# Production TURN / STUN for VaultChat calls

VaultChat clients fetch ICE servers from `GET /api/v1/calls/ice-servers` (authenticated). The API generates short-lived TURN credentials using `TURN_SECRET` — no secrets ship in client apps.

## Architecture

```
Client (web / mobile / desktop)
    → GET /api/v1/calls/ice-servers  (Bearer token)
    → STUN + TURN URLs with HMAC username/password
    → WebRTC peer connection (CallSession)
```

Gateway handles call **signaling** only. Media flows P2P or via TURN relay.

## Development (local)

Already configured in `infra/docker/docker-compose.yml` (coturn) and `.env.example`:

```env
STUN_URL=stun:stun.l.google.com:19302
TURN_URL=turn:localhost:3478
TURN_SECRET=vaultchat-turn-dev-secret
```

Start infra: `pnpm infra:up`

For **mobile on LAN**, use your machine IP:

```env
TURN_URL=turn:192.168.x.x:3478
```

## Production — self-hosted coturn (recommended)

### 1. Provision a VPS

Hetzner (~€4/mo), Fly.io, DigitalOcean, etc. Ubuntu 22.04+ works well.

### 2. Install coturn

```bash
sudo apt update && sudo apt install -y coturn
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

### 3. Configure `/etc/turnserver.conf`

```conf
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=YOUR_LONG_RANDOM_SECRET
realm=vaultchat
total-quota=100
stale-nonce=600
no-loopback-peers
no-multicast-peers
```

Generate secret: `openssl rand -hex 32`

### 4. TLS for `turns:` (optional but recommended)

Use certbot + point coturn at fullchain.pem / privkey.pem:

```conf
cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem
```

### 5. Firewall

| Port | Protocol | Purpose |
|------|----------|---------|
| 3478 | UDP/TCP | TURN |
| 5349 | TCP | TURNS (TLS) |
| 49152–65535 | UDP | Relay ports (coturn default range) |

### 6. VaultChat `.env` (production)

```env
STUN_URL=stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478
TURN_URL=turn:turn.yourdomain.com:3478,turns:turn.yourdomain.com:5349
TURN_SECRET=YOUR_LONG_RANDOM_SECRET
```

Restart API + gateway after changing env.

## Managed TURN (staging / early beta)

**Metered.ca** offers ~20 GB/month free: [metered.ca/stun-turn](https://www.metered.ca/stun-turn)

For a quick test without self-hosting, you can temporarily paste their ICE server URLs into a provider adapter in `packages/api-core/src/calls.ts`. The built-in HMAC flow targets coturn `use-auth-secret`.

## Web Push for incoming calls (optional)

When the browser tab is closed, incoming calls need Web Push:

1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Add to `.env`:

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # same as VAPID_PUBLIC_KEY
```

3. Web client registers via `apps/web/src/lib/push.ts` (service worker at `public/sw.js`).
4. Gateway already calls `POST /api/v1/calls/notify-incoming` → Expo push for mobile; extend `packages/api-core/src/push.ts` for `platform: "web"` tokens when VAPID is configured.

## Multi-instance gateway

Call state is stored in **Redis** (`vaultchat:call:*` keys) so multiple gateway replicas can share signaling state. Ensure all gateway instances use the same `REDIS_URL`.

## Checklist

- [ ] coturn running with `use-auth-secret`
- [ ] `TURN_SECRET` matches coturn `static-auth-secret`
- [ ] `TURN_URL` reachable from client networks (not localhost in prod)
- [ ] UDP relay ports open on firewall
- [ ] Test call between Wi‑Fi and cellular (TURN relay path)
