import { VaultDevice } from "@vaultchat/crypto";
import {
  bootstrapDevice,
  captureGroupKeyFromContent,
  clearSession,
  createGateway,
  decryptEnvelope,
  fetchConversations,
  fetchInbox,
  fetchMe,
  friendlyError,
  loadSession,
  MessageInbox,
  persistDevice,
  previewText,
  ReadStateManager,
  replenishPreKeysIfNeeded,
  saveSession,
  type ConnectionState,
  type DisplayMessage,
  type GatewayHandle,
  type StoredSession,
} from "@vaultchat/client";
import type { ConversationPreview, MessageEnvelope, WsServerEvent } from "@vaultchat/protocol";
import * as Notifications from "expo-notifications";
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
  unreadByPeer: Record<string, number>;
  chatUnreadCount: number;
  previews: Record<string, string>;
  setActivePeer: (peerId: string | null) => void;
  markConversationRead: (peerId: string, messageAt: string) => void;
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
  const [unreadByPeer, setUnreadByPeer] = useState<Record<string, number>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const gatewayRef = useRef<GatewayHandle | null>(null);
  const deviceRef = useRef<VaultDevice | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);
  const inboxRef = useRef(new MessageInbox());
  const readStateRef = useRef<ReadStateManager | null>(null);
  const activePeerIdRef = useRef<string | null>(null);
  const onMessageHandlers = useRef(
    new Set<(display: DisplayMessage, envelope: MessageEnvelope) => void>()
  );
  const onServerEventHandlers = useRef(new Set<(e: WsServerEvent) => void>());

  deviceRef.current = device;
  sessionRef.current = session;

  const chatUnreadCount = Object.values(unreadByPeer).reduce((sum, n) => sum + n, 0);

  const setSession = useCallback((s: StoredSession | null) => {
    setSessionState(s);
  }, []);

  const clearUnread = useCallback((peerId: string) => {
    setUnreadByPeer((prev) => {
      if (!prev[peerId]) return prev;
      const { [peerId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const markConversationRead = useCallback(
    (peerId: string, messageAt: string) => {
      readStateRef.current?.markPeerRead(peerId, messageAt);
      clearUnread(peerId);
    },
    [clearUnread]
  );

  const setActivePeer = useCallback((peerId: string | null) => {
    activePeerIdRef.current = peerId;
  }, []);

  const ensureReadState = useCallback(async (sess: StoredSession) => {
    if (readStateRef.current) return readStateRef.current;
    const mgr = new ReadStateManager(storage, sess.userId, { token: sess.token });
    await mgr.load();
    readStateRef.current = mgr;
    return mgr;
  }, []);

  const handleIncomingEnvelope = useCallback(
    async (envelope: MessageEnvelope) => {
      const dev = deviceRef.current;
      const sess = sessionRef.current;
      if (!dev || !sess) return;

      if (inboxRef.current.hasProcessed(envelope.id)) return;
      inboxRef.current.markProcessed(envelope.id);

      const readState = await ensureReadState(sess);
      const peerId = inboxRef.current.peerIdForEnvelope(envelope, sess.userId);

      try {
        const display = await decryptEnvelope(dev, envelope, sess.userId, {
          storage,
          userId: sess.userId,
          myDeviceId: sess.deviceId,
        });
        await persistDevice(storage, dev, sess.userId);
        if (await captureGroupKeyFromContent(storage, sess.userId, display.content)) {
          setGroupKeysVersion((v) => v + 1);
          return;
        }
        if (display.content.type === "group_key") return;

        setPreviews((p) => ({ ...p, [peerId]: previewText(display) }));

        const viewingPeer = activePeerIdRef.current === peerId;

        if (display.status !== "decrypt_failed") {
          for (const handler of onMessageHandlers.current) handler(display, envelope);
        }

        if (viewingPeer) {
          readState.markPeerRead(peerId, envelope.createdAt);
        } else if (
          inboxRef.current.shouldIncrementUnread(envelope, sess.userId, readState, {
            isViewingPeer: false,
            decryptFailed: display.status === "decrypt_failed",
          })
        ) {
          setUnreadByPeer((prev) => ({
            ...prev,
            [peerId]: (prev[peerId] ?? 0) + 1,
          }));
        }

        try {
          const { conversations: list } = await fetchConversations(sess.token);
          setConversations(list);
        } catch {
          // non-fatal
        }
      } catch {
        // ignore undecryptable frames
      }
    },
    [ensureReadState]
  );

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
    inboxRef.current.clearProcessed();
    readStateRef.current = null;
    activePeerIdRef.current = null;
    setSessionState(null);
    setDevice(null);
    setConversations([]);
    setUnreadByPeer({});
    setPreviews({});
    setInitError(null);
    void Notifications.setBadgeCountAsync(0).catch(() => {});
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
          await ensureReadState(updated);
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
  }, [ensureReadState]);

  useEffect(() => {
    if (!session?.token || !session.emailVerified) {
      readStateRef.current = null;
      return;
    }
    void ensureReadState(session);
  }, [session?.userId, session?.token, session?.emailVerified, ensureReadState]);

  useEffect(() => {
    void Notifications.setBadgeCountAsync(chatUnreadCount).catch(() => {});
  }, [chatUnreadCount]);

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
          void handleIncomingEnvelope(envelope);
        },
        onServerEvent: (event) => {
          for (const handler of onServerEventHandlers.current) handler(event);
        },
        onAuthOk: () => {
          void (async () => {
            const sess = sessionRef.current;
            if (!sess) return;
            const readState = await ensureReadState(sess);
            try {
              const { messages } = await fetchInbox(sess.token);
              for (const envelope of messages) {
                if (inboxRef.current.hasProcessed(envelope.id)) continue;
                const peerId = inboxRef.current.peerIdForEnvelope(envelope, sess.userId);
                if (readState.isPeerMessageRead(peerId, envelope.createdAt)) {
                  inboxRef.current.markProcessed(envelope.id);
                  continue;
                }
                await handleIncomingEnvelope(envelope);
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
  }, [session?.token, handleIncomingEnvelope, ensureReadState, logout]);

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
        unreadByPeer,
        chatUnreadCount,
        previews,
        setActivePeer,
        markConversationRead,
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
