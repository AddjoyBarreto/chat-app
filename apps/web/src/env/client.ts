/**
 * Public browser env only (`NEXT_PUBLIC_*`). Safe to import from Client Components.
 */

export const clientEnv = Object.freeze({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000",
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined,
});

export type ClientEnv = typeof clientEnv;
