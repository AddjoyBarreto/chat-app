import { VaultDevice } from "@vaultchat/crypto";
import {
  bootstrapDevice,
  captureGroupKeyFromContent,
  clearSession,
  createGateway,
  cacheDecryptedMessage,
  decryptEnvelope,
  fetchConversations,
  fetchInbox,
  fetchMe,
  friendlyError,
  historyDecryptOptions,
  loadDevice,
  loadSession,
  persistDevice,
  replenishPreKeysIfNeeded,
  saveSession,
  type ConnectionState,
  type DisplayMessage,
  type GatewayHandle,
  type StoredSession,
} from "@vaultchat/client";
import type { ConversationPreview, MessageEnvelope, WsServerEvent } from "@vaultchat/protocol";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { setupPushNotifications } from "@/lib/push";
import { createSecureStorageAdapter } from "@/lib/storage";

interface AppContextValue {
  session: StoredSession | null;
  device: VaultDevice | null;
  connectionState: ConnectionState;
  conversations: ConversationPreview[];
  refreshConversations: () => Promise<void>;
  setSession: (s: StoredSession | null) => void;
  setDevice: (d: VaultDevice | null) => void;
  logout: () => Promise<void>;
  initError: string | null;
  ready: boolean;
  onMessageHandlers: React.MutableRefObject<
    Set<(display: DisplayMessage, envelope: MessageEnvelope) => void>
  >;
  onServerEventHandlers: React.MutableRefObject<Set<(e: WsServerEvent) => void>>;
  gatewaySend: (event: import("@vaultchat/protocol").WsClientEvent) => boolean;
  groupKeysVersion: number;
  replenishKeysIfNeeded: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const storage = createSecureStorageAdapter();

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<StoredSession | null>(null);
  const [device, setDevice] = useState<VaultDevice | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [groupKeysVersion, setGroupKeysVersion] = useState(0);
  const gatewayRef = useRef<GatewayHandle | null>(null);
  const deviceRef = useRef<VaultDevice | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);
  const onMessageHandlers = useRef(
    new Set<(display: DisplayMessage, envelope: MessageEnvelope) => void>()
  );
  const onServerEventHandlers = useRef(new Set<(e: WsServerEvent) => void>());
  const processedEnvelopeIds = useRef(new Set<string>());

  deviceRef.current = device;
  sessionRef.current = session;

  const setSession = useCallback((s: StoredSession | null) => {
    setSessionState(s);
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!session) return;
    try {
      const { conversations: list } = await fetchConversations(session.token);
      setConversations(list);
    } catch {
      // non-fatal
    }
  }, [session]);

  const replenishKeysIfNeeded = useCallback(async () => {
    if (!session || !device) return;
    await replenishPreKeysIfNeeded(storage, device, session.token, session.userId);
  }, [session, device]);

  const logout = useCallback(async () => {
    gatewayRef.current?.close();
    gatewayRef.current = null;
    await clearSession(storage);
    setSessionState(null);
    setDevice(null);
    setConversations([]);
    setInitError(null);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const sess = await loadSession(storage);
        if (sess) {
          const me = await fetchMe(sess.token);
          const updated = { ...sess, emailVerified: me.emailVerified };
          if (me.emailVerified !== sess.emailVerified) {
            await saveSession(storage, updated);
          }
          setSessionState(updated);

          if (!me.emailVerified) {
            setReady(true);
            return;
          }

          const dev = await bootstrapDevice(storage, updated);
          setDevice(dev);
          const { conversations: list } = await fetchConversations(updated.token);
          setConversations(list);
          void setupPushNotifications(updated.token);
        }
      } catch (err) {
        setInitError(friendlyError(err));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!session) {
      gatewayRef.current?.close();
      gatewayRef.current = null;
      return;
    }

    gatewayRef.current?.close();
    gatewayRef.current = createGateway(
      session.token,
      {
        onMessage: (envelope) => {
          void (async () => {
            const dev = deviceRef.current;
            const sess = sessionRef.current;
            if (!dev || !sess) return;
            if (processedEnvelopeIds.current.has(envelope.id)) return;
            processedEnvelopeIds.current.add(envelope.id);
            try {
              const display = await decryptEnvelope(dev, envelope, sess.userId, {
                storage,
                userId: sess.userId,
                myDeviceId: sess.deviceId,
              });
              await persistDevice(storage, dev, sess.userId);
              if (await captureGroupKeyFromContent(storage, sess.userId, display.content)) {
                setGroupKeysVersion((v) => v + 1);
              }
              if (display.status !== "decrypt_failed") {
                for (const handler of onMessageHandlers.current) handler(display, envelope);
              }
            } catch {
              // ignore undecryptable frames
            }
          })();
        },
        onServerEvent: (event) => {
          for (const handler of onServerEventHandlers.current) handler(event);
        },
        onAuthOk: () => {
          void (async () => {
            const dev = deviceRef.current;
            const sess = sessionRef.current;
            if (!dev || !sess) return;
            try {
              const { messages } = await fetchInbox(sess.token);
              for (const envelope of messages) {
                if (processedEnvelopeIds.current.has(envelope.id)) continue;
                processedEnvelopeIds.current.add(envelope.id);
                try {
                  const display = await decryptEnvelope(dev, envelope, sess.userId, {
                    storage,
                    userId: sess.userId,
                    myDeviceId: sess.deviceId,
                  });
                  await persistDevice(storage, dev, sess.userId);
                  if (await captureGroupKeyFromContent(storage, sess.userId, display.content)) {
                    setGroupKeysVersion((v) => v + 1);
                  }
                  if (display.status !== "decrypt_failed") {
                    for (const handler of onMessageHandlers.current) handler(display, envelope);
                  }
                } catch {
                  // skip undecryptable
                }
              }
            } catch {
              // non-fatal catch-up
            }
          })();
        },
        onAuthError: () => {
          void logout();
        },
      },
      setConnectionState
    );

    return () => gatewayRef.current?.close();
  }, [session?.token]);

  useEffect(() => {
    if (session) void refreshConversations();
  }, [session, refreshConversations]);

  return (
    <AppContext.Provider
      value={{
        session,
        device,
        connectionState,
        conversations,
        refreshConversations,
        setSession,
        setDevice,
        logout,
        initError,
        ready,
        onMessageHandlers,
        onServerEventHandlers,
        gatewaySend: (event) => gatewayRef.current?.send(event) ?? false,
        groupKeysVersion,
        replenishKeysIfNeeded,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export { storage };
