/**
 * Mobile public config from Expo `app.json` → `extra` (and EAS overrides).
 * Do not put secrets here.
 */
import Constants from "expo-constants";

type MobileExtra = {
  apiBaseUrl?: string;
  wsUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as MobileExtra;

export const mobileEnv = Object.freeze({
  apiBaseUrl: extra.apiBaseUrl ?? "http://localhost:3000",
  wsUrl: extra.wsUrl ?? "ws://localhost:3001",
});

export type MobileEnv = typeof mobileEnv;
