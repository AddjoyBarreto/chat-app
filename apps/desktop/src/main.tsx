import "./polyfills";
import { setClientConfig } from "@vaultchat/client";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { desktopEnv } from "./env";
import "./styles/discord.css";
import "./styles/community-sidebar.css";

const { apiBaseUrl, wsUrl } = desktopEnv;

const isTauri = "__TAURI_INTERNALS__" in window;

setClientConfig({
  apiBaseUrl,
  wsUrl,
  // Native WebView blocks cross-origin fetch — use Tauri HTTP plugin instead.
  ...(isTauri ? { fetch: tauriFetch } : {}),
});

if (!isTauri) {
  document.title = "VaultChat Desktop";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
