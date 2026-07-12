import type { VaultDevice } from "@vaultchat/crypto";
import type { ConversationPreview } from "@vaultchat/protocol";
import {
  cacheDecryptedMessage,
  clearLocalChatData,
  createLocalStorageAdapter,
  decryptEnvelope,
  dedupeMessages,
  encryptOutgoingMessage,
  fetchConversation,
  fetchConversations,
  forEachInboxPage,
  fetchMe,
  fetchOwnDeviceBundles,
  fetchPreKeyBundle,
  fetchRecipientDeviceBundles,
  formatMessageDate,
  friendlyError,
  historyDecryptOptions,
  loadSession,
  loginOnServer,
  lookupUser,
  mergeAndUploadAccountBackup,
  mergeConversationTimeline,
  MessageInbox,
  persistDevice,
  previewText,
  ReadStateManager,
  registerOnServer,
  saveSession,
  clearSession,
  sendEncryptedMessage,
  sortMessages,
  syncConversationWithCache,
  provisionDeviceForLogin,
  DeviceIdentityMismatchError,
  deviceStorageKey,
  uploadPreKeys,
  getLoginHint,
  validateRegistrationFields,
  validateUsername,
  normalizeRegistrationFields,
  bootstrapDevice,
  type DisplayMessage,
  type StorageAdapter,
  type StoredSession,
} from "@vaultchat/client";
import { VaultDevice as VaultDeviceClass } from "@vaultchat/crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGateway } from "./useGateway.js";

export interface VaultChatPeer {
  id: string;
  username: string;
}

export interface UseVaultChatOptions {
  storage?: StorageAdapter;
  /** Registered on the server when this client first links (e.g. "Desktop", "Web"). */
  deviceName?: string;
  onToast?: (message: string, type?: "info" | "error") => void;
  onServerEvent?: (event: import("@vaultchat/protocol").WsServerEvent) => void;
  wsUrl?: string;
}

function defaultDecryptOpts(
  storage: StorageAdapter,
  userId: string,
  deviceId: number,
  tryDecrypt = true
) {
  return { storage, userId, myDeviceId: deviceId, tryDecrypt };
}

export function useVaultChat(options: UseVaultChatOptions = {}) {
  const storage = options.storage ?? createLocalStorageAdapter();
  const onToastRef = useRef(options.onToast);
  onToastRef.current = options.onToast;
  const toast = useCallback(
    (message: string, type?: "info" | "error") => {
      onToastRef.current?.(message, type);
    },
    []
  );

  const bootstrapStartedRef = useRef(false);

  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [unreadByPeer, setUnreadByPeer] = useState<Record<string, number>>({});
  const [peer, setPeer] = useState<VaultChatPeer | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | undefined>();
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [groupKeysVersion, setGroupKeysVersion] = useState(0);

  const deviceRef = useRef<VaultDevice | null>(null);
  const messageIdsRef = useRef(new Set<string>());
  const openGenerationRef = useRef(0);
  const inboxRef = useRef(new MessageInbox());
  const readStateRef = useRef<ReadStateManager | null>(null);
  const conversationsRef = useRef(conversations);
  const peerRef = useRef(peer);
  const sessionRef = useRef(session);

  conversationsRef.current = conversations;
  peerRef.current = peer;
  sessionRef.current = session;

  const chatUnreadCount = Object.values(unreadByPeer).reduce((sum, n) => sum + n, 0);

  function resolveUsername(userId: string) {
    if (peerRef.current?.id === userId) return peerRef.current.username;
    const conv = conversationsRef.current.find((c) => c.peerId === userId);
    return conv?.peerUsername ?? userId.slice(0, 8);
  }

  const refreshConversations = useCallback(async (token: string) => {
    try {
      const { conversations: list } = await fetchConversations(token);
      setConversations(list);
    } catch {
      // non-fatal
    }
  }, []);

  const initDevice = useCallback(
    async (sess: StoredSession) => {
      const device = await bootstrapDevice(storage, sess);
      deviceRef.current = device;
    },
    [storage]
  );

  const addMessage = useCallback((msg: DisplayMessage) => {
    if (messageIdsRef.current.has(msg.id)) return;
    messageIdsRef.current.add(msg.id);
    setMessages((prev) => sortMessages(dedupeMessages([...prev, msg])));
    const peerId = peerRef.current?.id;
    const userId = sessionRef.current?.userId;
    if (peerId) {
      setPreviews((p) => ({ ...p, [peerId]: previewText(msg) }));
      if (userId) {
        void mergeConversationTimeline(storage, userId, peerId, [msg]);
      }
    }
  }, [storage]);

  const handleIncoming = useCallback(
    async (
      envelope: import("@vaultchat/protocol").MessageEnvelope,
      opts?: { inboxCatchUp?: boolean; appliedGroupKeys?: Set<string> }
    ) => {
      const device = deviceRef.current;
      const sess = sessionRef.current;
      const readState = readStateRef.current;
      if (!device || !sess || !readState) return;

      if (inboxRef.current.hasProcessed(envelope.id)) return;
      inboxRef.current.markProcessed(envelope.id);

      const peerId = inboxRef.current.peerIdForEnvelope(envelope, sess.userId);

      try {
        const display = await decryptEnvelope(
          device,
          envelope,
          sess.userId,
          defaultDecryptOpts(storage, sess.userId, sess.deviceId)
        );

        if (display.status !== "decrypt_failed") {
          await persistDevice(storage, device, sess.userId);
        }

        setPreviews((p) => ({ ...p, [peerId]: previewText(display) }));

        if (display.content.type === "group_key" && display.content.groupKey) {
          const gid = display.content.groupKey.groupId;
          if (opts?.inboxCatchUp && opts.appliedGroupKeys?.has(gid)) {
            return;
          }
          const { captureGroupKeyFromContent } = await import("@vaultchat/client");
          const saved = await captureGroupKeyFromContent(
            storage,
            sess.userId,
            display.content,
            { replaceExisting: true }
          );
          opts?.appliedGroupKeys?.add(gid);
          if (saved) setGroupKeysVersion((v) => v + 1);
          return;
        }

        // Don't treat note-to-self key sync as a normal conversation bump for "me"
        if (peerId === sess.userId) return;

        const viewingPeer = peerRef.current?.id === peerId;

        if (viewingPeer) {
          addMessage(display);
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
          toast(`New message from @${resolveUsername(peerId)}`, "info");
        }

        void refreshConversations(sess.token);
      } catch {
        toast("Failed to decrypt message", "error");
      }
    },
    [storage, addMessage, refreshConversations, toast]
  );

  const { connectionState, isConnected, send } = useGateway(
    session?.token ?? null,
    {
      onMessage: handleIncoming,
      onServerEvent: options.onServerEvent,
      onAuthOk: () => {
        void (async () => {
          const sess = sessionRef.current;
          const readState = readStateRef.current;
          if (!sess || !readState) return;
          try {
            const appliedGroupKeys = new Set<string>();
            await forEachInboxPage(sess.token, async (inbox) => {
              for (const envelope of inbox) {
                if (inboxRef.current.hasProcessed(envelope.id)) continue;
                const peerId = inboxRef.current.peerIdForEnvelope(envelope, sess.userId);
                // Still process note-to-self (multi-device key sync) even if "read".
                if (
                  peerId !== sess.userId &&
                  readState.isPeerMessageRead(peerId, envelope.createdAt)
                ) {
                  inboxRef.current.markProcessed(envelope.id);
                  continue;
                }
                // Newest-first: apply at most one group_key per community so older
                // shares cannot overwrite a newer key from an earlier page.
                await handleIncoming(envelope, {
                  inboxCatchUp: true,
                  appliedGroupKeys,
                });
              }
            });
          } catch {
            // non-fatal
          }
        })();
      },
      onAuthError: () => {
        void logout();
        toast("Session expired. Please sign in again.", "error");
      },
    },
    options.wsUrl
  );

  useEffect(() => {
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;

    void (async () => {
      const sess = await loadSession(storage);
      if (!sess) {
        setReady(true);
        return;
      }
      readStateRef.current = new ReadStateManager(storage, sess.userId, { token: sess.token });
      await readStateRef.current.load();
      setSession(sess);
      try {
        const me = await fetchMe(sess.token);
        const updated = { ...sess, emailVerified: me.emailVerified };
        if (me.emailVerified !== sess.emailVerified) {
          await saveSession(storage, updated);
        }
        setSession(updated);
        if (me.emailVerified) {
          const device = await bootstrapDevice(storage, updated);
          deviceRef.current = device;
          setInitError(null);
          await refreshConversations(updated.token);
        }
      } catch (err) {
        if (
          err instanceof DeviceIdentityMismatchError ||
          (err instanceof Error && err.message === "DEVICE_IDENTITY_MISMATCH")
        ) {
          await storage.removeItem(deviceStorageKey(sess.userId));
          await clearSession(storage);
          setSession(null);
          deviceRef.current = null;
          const msg = friendlyError(err);
          setInitError(msg);
          toast(msg, "error");
        }
      } finally {
        setReady(true);
      }
    })();
  }, [storage, refreshConversations]);

  async function login(identifier: string, password: string) {
    setLoading(true);
    try {
      const id = identifier.trim().toLowerCase();
      const hint = await getLoginHint(storage, id);
      const preLogin = await loginOnServer({
        identifier: id,
        password,
        deviceId: hint?.deviceId ?? 1,
      });

      const { login: loginResult, device } = await provisionDeviceForLogin(storage, {
        identifier: id,
        password,
        userId: preLogin.userId,
        deviceIdHint: hint?.deviceId ?? preLogin.deviceId,
        token: preLogin.token,
        deviceName: options.deviceName,
      });

      deviceRef.current = device;
      setInitError(null);

      const stored: StoredSession = {
        username: loginResult.username,
        userId: loginResult.userId,
        token: loginResult.token,
        deviceId: loginResult.deviceId,
        emailVerified: loginResult.emailVerified,
      };
      await saveSession(storage, stored, id.includes("@") ? id : undefined);
      await persistDevice(storage, device, stored.userId);
      readStateRef.current = new ReadStateManager(storage, stored.userId, { token: stored.token });
      await readStateRef.current.load();
      setSession(stored);
      if (loginResult.emailVerified) {
        await initDevice(stored);
        await refreshConversations(stored.token);
      }
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setLoading(false);
    }
  }

  async function register(fields: ReturnType<typeof normalizeRegistrationFields>) {
    setLoading(true);
    try {
      const device = await VaultDeviceClass.create(fields.username);
      deviceRef.current = device;
      const material = await device.exportKeyMaterial();
      const reg = await registerOnServer({
        username: fields.username,
        email: fields.email,
        password: fields.password,
        phoneCountryCode: fields.phoneCountryCode,
        phoneNumber: fields.phoneNumber,
        identityKeyPublic: material.identityKeyPublic,
        registrationId: material.registrationId,
      });
      const linked = await VaultDeviceClass.restore(reg.userId, reg.deviceId, device.exportState());
      deviceRef.current = linked;
      await uploadPreKeys(reg.token, {
        signedPreKey: material.signedPreKey,
        oneTimePreKeys: material.oneTimePreKeys,
      });
      const stored: StoredSession = {
        username: fields.username,
        userId: reg.userId,
        token: reg.token,
        deviceId: reg.deviceId,
        emailVerified: reg.emailVerified,
      };
      await saveSession(storage, stored, fields.email);
      await persistDevice(storage, linked, stored.userId);
      try {
        await mergeAndUploadAccountBackup(reg.token, fields.password, linked);
      } catch {
        // non-fatal
      }
      readStateRef.current = new ReadStateManager(storage, stored.userId, { token: stored.token });
      await readStateRef.current.load();
      setSession(stored);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    const userId = session?.userId ?? sessionRef.current?.userId;
    if (session) await readStateRef.current?.clear();
    if (userId) {
      await clearLocalChatData(storage, userId);
      await storage.removeItem(deviceStorageKey(userId));
    }
    await clearSession(storage);
    setSession(null);
    deviceRef.current = null;
    setInitError(null);
    inboxRef.current.clearProcessed();
    messageIdsRef.current.clear();
    setMessages([]);
    setConversations([]);
    setPeer(null);
    setUnreadByPeer({});
  }

  async function closeConversation() {
    setPeer(null);
    setMessages([]);
    messageIdsRef.current.clear();
    setMessageCursor(undefined);
    setHasMoreMessages(false);
  }

  async function openConversation(peerId: string, peerUsername: string) {
    const sess = sessionRef.current;
    const readState = readStateRef.current;
    if (!sess || !readState) return;

    const generation = ++openGenerationRef.current;
    const isCurrent = () => generation === openGenerationRef.current;

    const conv = conversations.find((c) => c.peerId === peerId);
    if (conv) readState.markPeerRead(peerId, conv.lastMessageAt);

    setUnreadByPeer((prev) => {
      if (!prev[peerId]) return prev;
      const { [peerId]: _, ...rest } = prev;
      return rest;
    });
    setPeer({ id: peerId, username: peerUsername });
    setMessages([]);
    messageIdsRef.current.clear();
    setMessageCursor(undefined);
    setHasMoreMessages(false);
    setLoading(true);

    try {
      const device = deviceRef.current!;
      const { messages: synced, cursor, hasMore } =
        await syncConversationWithCache({
          storage,
          device,
          token: sess.token,
          userId: sess.userId,
          deviceId: sess.deviceId,
          peerId,
          limit: 50,
          isCurrent,
          onHydrated: (cached) => {
            if (!isCurrent()) return;
            for (const m of cached) {
              inboxRef.current.markProcessed(m.id);
              messageIdsRef.current.add(m.id);
            }
            setMessages(cached);
            // Instant paint from device cache; keep a light sync indicator.
            setLoading(false);
          },
        });

      if (!isCurrent()) return;

      for (const m of synced) {
        inboxRef.current.markProcessed(m.id);
        messageIdsRef.current.add(m.id);
      }

      setMessages(synced);
      setMessageCursor(cursor);
      setHasMoreMessages(Boolean(hasMore));

      const last = synced[synced.length - 1];
      if (last) {
        setPreviews((p) => ({ ...p, [peerId]: previewText(last) }));
        readState.markPeerRead(peerId, last.time);
      }
    } catch (e) {
      if (!isCurrent()) return;
      toast(String(e), "error");
      setPeer(null);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }

  async function loadOlderMessages() {
    const sess = sessionRef.current;
    if (!sess || !peer || !messageCursor || loadingOlder || !hasMoreMessages) return;
    setLoadingOlder(true);
    try {
      const { messages: envelopes, cursor, hasMore } = await fetchConversation(
        sess.token,
        peer.id,
        { cursor: messageCursor, limit: 50 }
      );
      const device = deviceRef.current!;
      const older: DisplayMessage[] = [];
      for (const envelope of envelopes) {
        if (messageIdsRef.current.has(envelope.id)) continue;
        const display = await decryptEnvelope(
          device,
          envelope,
          sess.userId,
          historyDecryptOptions(storage, sess.userId, envelope, sess.userId, sess.deviceId)
        );
        older.push(display);
        messageIdsRef.current.add(display.id);
      }
      setMessages((prev) => {
        const merged = sortMessages(dedupeMessages([...older, ...prev]));
        void mergeConversationTimeline(storage, sess.userId, peer.id, older);
        return merged;
      });
      setMessageCursor(cursor);
      setHasMoreMessages(Boolean(hasMore));
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function startNewChat() {
    const sess = sessionRef.current;
    if (!sess) return;
    const name = search.trim().toLowerCase();
    const validation = validateUsername(name);
    if (validation) {
      toast(validation, "error");
      return;
    }
    if (name === sess.username) {
      toast("You can't message yourself.", "error");
      return;
    }
    setLoading(true);
    try {
      const user = await lookupUser(name);
      setSearch("");
      await openConversation(user.id, user.username);
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    const sess = sessionRef.current;
    if (!sess || !peer || !draft.trim()) return;
    const device = deviceRef.current;
    if (!device) {
      toast("Device keys missing. Please log out and sign in again.", "error");
      return;
    }

    const text = draft.trim();
    setDraft("");
    setSending(true);

    const optimisticId = crypto.randomUUID();
    addMessage({
      id: optimisticId,
      from: "me",
      content: { type: "text", text },
      time: new Date().toISOString(),
      date: "Today",
      status: "sent",
    });

    try {
      const [peerBundles, ownBundles] = await Promise.all([
        fetchRecipientDeviceBundles(peer.id),
        fetchOwnDeviceBundles(sess.token, sess.userId),
      ]);
      const { recipientPayload, recipientCiphertexts, senderCiphertexts } =
        await encryptOutgoingMessage(
        device,
        sess.userId,
        peer.id,
        { type: "text", text },
        peerBundles,
        ownBundles
      );
      const result = await sendEncryptedMessage(
        sess.token,
        peer.id,
        recipientPayload,
        "text",
        undefined,
        peerBundles[0]?.deviceId ?? 1,
        senderCiphertexts,
        recipientCiphertexts
      );
      await persistDevice(storage, device, sess.userId);

      const sentMessage: DisplayMessage = {
        id: result.messageId,
        from: "me",
        content: { type: "text", text },
        time: result.createdAt,
        date: formatMessageDate(result.createdAt),
        status: "sent",
      };

      messageIdsRef.current.delete(optimisticId);
      setMessages((prev) =>
        sortMessages(
          dedupeMessages(prev.map((m) => (m.id === optimisticId ? sentMessage : m)))
        )
      );
      messageIdsRef.current.add(result.messageId);
      await cacheDecryptedMessage(storage, sess.userId, sentMessage);
      await mergeConversationTimeline(storage, sess.userId, peer.id, [sentMessage]);
      setPreviews((p) => ({ ...p, [peer.id]: text }));
      void refreshConversations(sess.token);
    } catch (e) {
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== optimisticId);
        const last = next[next.length - 1];
        if (peer) {
          setPreviews((p) => ({
            ...p,
            [peer.id]: last ? previewText(last) : "",
          }));
        }
        return next;
      });
      messageIdsRef.current.delete(optimisticId);
      toast(friendlyError(e), "error");
    } finally {
      setSending(false);
    }
  }

  return {
    session,
    ready,
    initError,
    loading,
    sending,
    conversations,
    previews,
    unreadByPeer,
    chatUnreadCount,
    peer,
    messages,
    draft,
    setDraft,
    search,
    setSearch,
    connectionState,
    isConnected,
    hasMoreMessages,
    loadingOlder,
    groupKeysVersion,
    login,
    logout,
    register,
    openConversation,
    closeConversation,
    loadOlderMessages,
    startNewChat,
    sendMessage,
    refreshConversations,
    validateRegistrationFields,
    normalizeRegistrationFields,
    send,
    resolveUsername,
  };
}
