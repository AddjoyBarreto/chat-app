import "./load-env.js";
import { createServer } from "node:http";
import {
  createApiContext,
  MESSAGE_CHANNEL_PREFIX,
  verifyToken,
} from "@vaultchat/api-core";
import type { WsClientEvent, WsServerEvent } from "@vaultchat/protocol";
import Redis from "ioredis";
import { WebSocketServer, type WebSocket } from "ws";
import { cleanupCallsForUser, handleCallEvent } from "./calls.js";
import { gatewayEnv } from "./env.js";
import { handleUserConnected, handleUserDisconnected, handlePresenceSet } from "./presence.js";

const { port: PORT, redisUrl: REDIS_URL, jwtSecret: JWT_SECRET, databaseUrl: DATABASE_URL } =
  gatewayEnv;

const apiCtx = createApiContext({
  databaseUrl: DATABASE_URL,
  redisUrl: REDIS_URL,
  jwtSecret: JWT_SECRET,
});

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

const redisSub = new Redis(REDIS_URL);
const redis = new Redis(REDIS_URL);

const clientsByUser = new Map<string, Set<AuthenticatedSocket>>();

function send(ws: WebSocket, event: WsServerEvent) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function sendToUser(targetUserId: string, event: WsServerEvent): boolean {
  const set = clientsByUser.get(targetUserId);
  if (!set || set.size === 0) return false;
  for (const ws of set) send(ws, event);
  return true;
}

function addClient(userId: string, ws: AuthenticatedSocket) {
  let set = clientsByUser.get(userId);
  if (!set) {
    set = new Set();
    clientsByUser.set(userId, set);
    void redisSub.subscribe(`${MESSAGE_CHANNEL_PREFIX}${userId}`);
  }
  set.add(ws);
}

function removeClient(userId: string, ws: AuthenticatedSocket) {
  const set = clientsByUser.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) {
    clientsByUser.delete(userId);
    void redisSub.unsubscribe(`${MESSAGE_CHANNEL_PREFIX}${userId}`);
  }
}

redisSub.on("message", (channel, payload) => {
  const userId = channel.slice(MESSAGE_CHANNEL_PREFIX.length);
  const set = clientsByUser.get(userId);
  if (!set) return;

  try {
    const parsed = JSON.parse(payload) as WsServerEvent;
    for (const ws of set) {
      send(ws, parsed);
    }
  } catch (err) {
    console.error("Failed to fan-out message:", err);
  }
});

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "vaultchat-gateway" }));
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: AuthenticatedSocket) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", async (raw) => {
    try {
      const event = JSON.parse(raw.toString()) as WsClientEvent;

      if (event.type === "ping") {
        send(ws, { type: "pong" });
        return;
      }

      if (event.type === "auth") {
        try {
          const claims = await verifyToken(JWT_SECRET, event.token);
          ws.userId = claims.sub;
          addClient(claims.sub, ws);
          send(ws, { type: "auth_ok", userId: claims.sub });
          await handleUserConnected(apiCtx, redis, claims.sub, ws, clientsByUser, send, sendToUser);
        } catch {
          send(ws, { type: "auth_error", error: "Invalid token" });
          ws.close();
        }
        return;
      }

      if (!ws.userId) {
        send(ws, { type: "error", error: "Not authenticated" });
        return;
      }

      if (event.type === "presence_set") {
        await handlePresenceSet(apiCtx, redis, ws.userId, event.status, clientsByUser, sendToUser);
        return;
      }

      const callTypes = [
        "call_invite",
        "call_accept",
        "call_reject",
        "call_offer",
        "call_answer",
        "call_ice",
        "call_end",
      ] as const;

      if ((callTypes as readonly string[]).includes(event.type)) {
        const err = await handleCallEvent(redis, ws.userId, event, sendToUser);
        if (err) send(ws, err);
        return;
      }

      send(ws, { type: "error", error: "Unknown event type" });
    } catch {
      send(ws, { type: "error", error: "Invalid message format" });
    }
  });

  ws.on("close", () => {
    if (ws.userId) {
      const userId = ws.userId;
      void cleanupCallsForUser(redis, userId, sendToUser);
      removeClient(userId, ws);
      void handleUserDisconnected(apiCtx, redis, userId, clientsByUser, sendToUser);
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    const sock = ws as AuthenticatedSocket;
    if (!sock.isAlive) {
      sock.terminate();
      continue;
    }
    sock.isAlive = false;
    sock.ping();
  }
}, 30_000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`VaultChat gateway listening on 0.0.0.0:${PORT}`);
});
