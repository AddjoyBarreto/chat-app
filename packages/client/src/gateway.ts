import type { MessageEnvelope, WsClientEvent, WsServerEvent } from "@vaultchat/protocol";
import { getClientConfig } from "./config.js";

function dispatchServerEvent(
  event: WsServerEvent,
  onMessage: (envelope: MessageEnvelope) => void,
  onServerEvent?: (event: WsServerEvent) => void
) {
  if (event.type === "message") {
    onMessage(event.envelope);
    return;
  }
  onServerEvent?.(event);
}

export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

const MAX_RECONNECT_DELAY = 30_000;
const PING_INTERVAL = 25_000;

export interface GatewayHandle {
  close: () => void;
  reconnect: () => void;
  send: (event: WsClientEvent) => boolean;
}

export function createGateway(
  token: string,
  handlers: {
    onMessage: (envelope: MessageEnvelope) => void;
    onServerEvent?: (event: WsServerEvent) => void;
    onAuthOk?: () => void;
    onAuthError?: () => void;
  },
  onStateChange: (state: ConnectionState) => void
): GatewayHandle {
  let ws: WebSocket | null = null;

  function sendEvent(event: WsClientEvent): boolean {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
      return true;
    }
    return false;
  }
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let intentionalClose = false;

  function clearTimers() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    reconnectTimer = null;
    pingTimer = null;
  }

  function scheduleReconnect() {
    if (intentionalClose) return;
    const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY);
    reconnectAttempt += 1;
    onStateChange("reconnecting");
    reconnectTimer = setTimeout(connect, delay);
  }

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;
    clearTimers();
    onStateChange(reconnectAttempt > 0 ? "reconnecting" : "connecting");

    ws = new WebSocket(getClientConfig().wsUrl);

    ws.onopen = () => {
      ws!.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WsServerEvent;
        if (data.type === "auth_ok") {
          reconnectAttempt = 0;
          onStateChange("connected");
          handlers.onAuthOk?.();
          pingTimer = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, PING_INTERVAL);
        }
        dispatchServerEvent(data, handlers.onMessage, handlers.onServerEvent);
        if (data.type === "auth_error") {
          onStateChange("disconnected");
          handlers.onAuthError?.();
          ws?.close();
        }
      } catch {
        // ignore bad frames
      }
    };

    ws.onclose = () => {
      clearTimers();
      ws = null;
      if (!intentionalClose) {
        onStateChange("disconnected");
        scheduleReconnect();
      }
    };

    ws.onerror = () => ws?.close();
  }

  connect();

  return {
    close: () => {
      intentionalClose = true;
      clearTimers();
      ws?.close();
      ws = null;
    },
    reconnect: () => {
      reconnectAttempt = 0;
      ws?.close();
      intentionalClose = false;
      connect();
    },
    send: sendEvent,
  };
}
