export interface ClientConfig {
  apiBaseUrl: string;
  wsUrl: string;
  /** Override fetch (e.g. Tauri plugin-http bypasses CORS in native WebView). */
  fetch?: typeof fetch;
}

let config: ClientConfig = {
  apiBaseUrl: "",
  wsUrl: "ws://localhost:3001",
};

export function setClientConfig(c: Partial<ClientConfig>) {
  config = { ...config, ...c };
}

export function getClientConfig(): ClientConfig {
  return config;
}
