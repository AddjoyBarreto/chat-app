/**
 * Tauri WebView (WKWebView) has no Node globals. Some bundled deps still touch Buffer.
 * Install must run before any workspace crypto/client imports.
 */
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}
