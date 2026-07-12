/**
 * Desktop (Vite) public env. Only `VITE_*` keys are exposed to the renderer.
 */

export const desktopEnv = Object.freeze({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
  wsUrl: import.meta.env.VITE_WS_URL ?? "ws://localhost:3001",
});

export type DesktopEnv = typeof desktopEnv;
