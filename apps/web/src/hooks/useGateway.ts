"use client";

import type { MessageEnvelope, WsClientEvent, WsServerEvent } from "@vaultchat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";
const MAX_RECONNECT_DELAY = 30_000;
const PING_INTERVAL = 25_000;

export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export function useGateway(
  token: string | null,
  handlers: {
    onMessage: (envelope: MessageEnvelope) => void;
    onServerEvent?: (event: WsServerEvent) => void;
    onAuthOk?: () => void;
    onAuthError?: () => void;
  }
) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalClose = useRef(false);

  handlersRef.current = handlers;

  const clearTimers = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (pingTimer.current) clearInterval(pingTimer.current);
    reconnectTimer.current = null;
    pingTimer.current = null;
  }, []);

  const send = useCallback((event: WsClientEvent): boolean => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
      return true;
    }
    return false;
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!token || intentionalClose.current) return;
    const delay = Math.min(1000 * 2 ** reconnectAttempt.current, MAX_RECONNECT_DELAY);
    reconnectAttempt.current += 1;
    setConnectionState("reconnecting");
    reconnectTimer.current = setTimeout(() => connect(), delay);
  }, [token]);

  const connect = useCallback(() => {
    if (!token) return;

    clearTimers();

    const existing = wsRef.current;
    if (existing) {
      intentionalClose.current = true;
      existing.close();
      wsRef.current = null;
      intentionalClose.current = false;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState(reconnectAttempt.current > 0 ? "reconnecting" : "connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WsServerEvent;
        if (data.type === "auth_ok") {
          reconnectAttempt.current = 0;
          setConnectionState("connected");
          handlersRef.current.onAuthOk?.();
          pingTimer.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, PING_INTERVAL);
        }
        if (data.type === "message") {
          handlersRef.current.onMessage(data.envelope);
        } else if (
          data.type !== "auth_ok" &&
          data.type !== "pong" &&
          data.type !== "auth_error"
        ) {
          handlersRef.current.onServerEvent?.(data);
        }
        if (data.type === "auth_error") {
          setConnectionState("disconnected");
          handlersRef.current.onAuthError?.();
          ws.close();
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      clearTimers();
      wsRef.current = null;
      if (!intentionalClose.current) {
        setConnectionState("disconnected");
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, clearTimers, scheduleReconnect]);

  useEffect(() => {
    intentionalClose.current = false;
    reconnectAttempt.current = 0;
    connect();

    return () => {
      intentionalClose.current = true;
      clearTimers();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, clearTimers]);

  return {
    connectionState,
    isConnected: connectionState === "connected",
    reconnect: () => {
      reconnectAttempt.current = 0;
      wsRef.current?.close();
      connect();
    },
    send,
  };
}
