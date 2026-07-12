import { setClientConfig } from "@vaultchat/client";
import { mobileEnv } from "@/env";
import { ensureMobileCrypto } from "@/lib/mobileCrypto";

export function bootstrapClient() {
  ensureMobileCrypto();

  setClientConfig({
    apiBaseUrl: mobileEnv.apiBaseUrl,
    wsUrl: mobileEnv.wsUrl,
  });
}
