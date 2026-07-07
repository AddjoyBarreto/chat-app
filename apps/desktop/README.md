# VaultChat Desktop (native)

Discord-style desktop client for VaultChat, packaged as a **native Mac/Windows app** via [Tauri 2](https://v2.tauri.app/).

## Prerequisites

| Platform | Required |
|----------|----------|
| All | Node 20+, pnpm, Rust ([rustup.rs](https://rustup.rs)) |
| macOS | Xcode Command Line Tools |
| Windows | Visual Studio Build Tools, [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) |

## Development

1. Start the backend (from repo root):

```bash
pnpm infra:up && pnpm infra:wait
pnpm dev:stack   # API :3000 + gateway :3001
```

2. In a second terminal, launch the **native window**:

```bash
pnpm desktop
```

This runs `tauri dev` — Vite serves the UI on `:3002` and Tauri opens a real app window (not a browser tab).

**Browser-only fallback** (no Rust):

```bash
pnpm --filter @vaultchat/desktop dev:web
# open http://localhost:3002
```

## Configuration

Copy `.env.example` to `.env` and set API/WS URLs if not using localhost defaults:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3001
```

For packaged builds, point these at your production API.

## Build installers

```bash
pnpm desktop:build
```

Output:

```
apps/desktop/src-tauri/target/release/bundle/macos/VaultChat.app   # open this directly
```

Optional DMG (if `create-dmg` / `hdiutil` work on your Mac):

```bash
pnpm --filter @vaultchat/desktop build:dmg
```

Full bundle (app + dmg/msi):

```bash
pnpm --filter @vaultchat/desktop build:all
```

### Port 3002 already in use

Another Vite/desktop dev session may still be running. Free the port:

```bash
node scripts/free-port.mjs 3002
pnpm desktop
```

`pnpm desktop` runs `predev` automatically to clear stale processes on :3002.

Regenerate app icons after changing `app-icon.png`:

```bash
pnpm --filter @vaultchat/desktop icon
```

## Features

- Discord-style layout (server rail, DM sidebar, chat panel)
- E2EE direct messages via `@vaultchat/chat-react`
- Voice & video calls (WebRTC)
- Friends list (add, accept, message)
- Account settings modal

Web (`apps/web`) keeps the mobile-style PWA UI. Desktop is a separate Discord-inspired shell.
