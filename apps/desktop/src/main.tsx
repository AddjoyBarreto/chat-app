import "./polyfills";
import { setClientConfig } from "@vaultchat/client";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/discord.css";
import "./styles/community-sidebar.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const wsUrl = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";

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
