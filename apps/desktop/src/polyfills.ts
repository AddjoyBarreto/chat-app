/**
 * Tauri WebView (WKWebView) has no Node globals. Some bundled deps still touch Buffer.
 * Install must run before any workspace crypto/client imports.
 */
import { Buffer } from "buffer";

const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (typeof g.Buffer === "undefined") {
  g.Buffer = Buffer;
}
