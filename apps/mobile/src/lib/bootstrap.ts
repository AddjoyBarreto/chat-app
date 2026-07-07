import { setClientConfig } from "@vaultchat/client";
import Constants from "expo-constants";
import { ensureMobileCrypto } from "@/lib/mobileCrypto";

export function bootstrapClient() {
  ensureMobileCrypto();

  const extra = Constants.expoConfig?.extra as
    | { apiBaseUrl?: string; wsUrl?: string }
    | undefined;

  setClientConfig({
    apiBaseUrl: extra?.apiBaseUrl ?? "http://localhost:3000",
    wsUrl: extra?.wsUrl ?? "ws://localhost:3001",
  });
}
