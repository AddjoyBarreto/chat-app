import { getClientConfig } from "./config.js";

/** Platform fetch — uses Tauri HTTP plugin on desktop when configured. */
export function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return (getClientConfig().fetch ?? globalThis.fetch)(input, init);
}
