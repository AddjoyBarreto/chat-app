export interface ClientConfig {
  apiBaseUrl: string;
  wsUrl: string;
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
