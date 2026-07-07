"use client";

import {
  captureGroupKeyFromContent,
  cacheDecryptedMessage,
  createLocalStorageAdapter,
  fetchGroups,
  fetchInbox,
  fetchOwnDeviceBundles,
  fetchRecipientDeviceBundles,
  MessageInbox,
  mergeAndUploadAccountBackup,
  prepareMediaMessage,
  ReadStateManager,
  bootstrapDevice,
  provisionDeviceForLogin,
} from "@vaultchat/client";
import { useCallSession, useFriends } from "@vaultchat/chat-react";
import { generateSafetyNumber, VaultDevice } from "@vaultchat/crypto";
import type { ChannelInfo, ConversationPreview, GroupInfo, WsServerEvent } from "@vaultchat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { ActiveCallOverlay } from "./ActiveCallOverlay";
import { IncomingCallModal } from "./IncomingCallModal";
import { useGateway } from "@/hooks/useGateway";
import { useToast } from "@/hooks/useToast";
import { ChatList } from "./ChatList";
import { ConversationView } from "./ConversationView";
import { FriendsPanel } from "./FriendsPanel";
import { CommunitySidebar } from "./CommunitySidebar";
import { GroupConversationView, type GroupDisplayMessage } from "./GroupConversationView";
import { GroupsList } from "./GroupsList";
import { AuthScreen, type AuthMode } from "./AuthScreen";
import { VerifyEmailPending } from "./VerifyEmailPending";
import { SafetyNumbersModal } from "./SafetyNumbersModal";
import { ToastContainer } from "./Toast";
import {
  fetchConversation,
  fetchConversations,
  fetchMe,
  redeemInvite,
  fetchCommunityChannels,
  fetchChannelCategories,
  fetchPreKeyBundle,
  loginOnServer,
  lookupUser,
  registerOnServer,
  resendVerificationEmail,
  sendEncryptedMessage,
  uploadPreKeys,
} from "@/lib/client-api";
import { registerWebPush } from "@/lib/push";
import { ClientApiError, friendlyError, mapLoginError, mapRegistrationError } from "@/lib/errors";
import {
  decryptEnvelope,
  dedupeMessages,
  encryptOutgoing,
  encryptOutgoingMessage,
  formatMessageDate,
  historyDecryptOptions,
  previewText,
  sortMessages,
  type DisplayMessage,
} from "@/lib/messages";
import {
  adminReshareGroupKey,
  createGroupWithKey,
  decryptIncomingGroupMessage,
  getGroupAccess,
  loadGroupMessages,
  sendGroupMediaMessage,
  sendGroupTextMessage,
} from "@/lib/groups";
import {
  clearSession,
  hasFieldErrors,
  loadOrCreateDevice,
  loadSession,
  getLoginHint,
  normalizeRegistrationFields,
  persistDevice,
  saveSession,
  validateRegistrationFields,
  validateUsername,
  type LoginFieldErrors,
  type RegistrationFieldErrors,
  type RegistrationFields,
  type StoredSession,
} from "@/lib/session";

type Screen = "list" | "conversation" | "group-conversation" | "community";
type Tab = "chats" | "friends" | "groups";

const webStorage = createLocalStorageAdapter();

function decryptOpts(userId: string, deviceId: number, tryDecrypt = true) {
  return { storage: webStorage, userId, myDeviceId: deviceId, tryDecrypt };
}

export function ChatApp() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [screen, setScreen] = useState<Screen>("list");
  const [tab, setTab] = useState<Tab>("chats");
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [activeGroup, setActiveGroup] = useState<{ id: string; name: string } | null>(null);
  const [groupMessages, setGroupMessages] = useState<GroupDisplayMessage[]>([]);
  const [groupDraft, setGroupDraft] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [groupMembersInput, setGroupMembersInput] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupIsAdmin, setGroupIsAdmin] = useState(false);
  const [groupHasKey, setGroupHasKey] = useState(true);
  const [resharingGroup, setResharingGroup] = useState(false);
  const [peer, setPeer] = useState<{ id: string; username: string } | null>(null);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | undefined>();
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [unreadByPeer, setUnreadByPeer] = useState<Record<string, number>>({});
  const [activeCommunity, setActiveCommunity] = useState<{ id: string; name: string } | null>(null);
  const [communityChannels, setCommunityChannels] = useState<ChannelInfo[]>([]);
  const [communityCategories, setCommunityCategories] = useState<import("@vaultchat/protocol").ChannelCategoryInfo[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChannelInfo | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [registerFields, setRegisterFields] = useState<RegistrationFields>({
    username: "",
    email: "",
    password: "",
    phoneCountry: "US",
    phoneNumber: "",
  });
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [registerErrors, setRegisterErrors] = useState<RegistrationFieldErrors>({});
  const [loginErrors, setLoginErrors] = useState<LoginFieldErrors>({});
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const deviceRef = useRef<VaultDevice | null>(null);
  const messageIdsRef = useRef(new Set<string>());
  const inboxRef = useRef(new MessageInbox());
  const readStateRef = useRef<ReadStateManager | null>(null);
  const callsRef = useRef<ReturnType<typeof useCallSession> | null>(null);
  const friendsRef = useRef<ReturnType<typeof useFriends> | null>(null);
  const conversationsRef = useRef(conversations);
  const peerRef = useRef(peer);
  const activeGroupRef = useRef(activeGroup);
  const screenRef = useRef(screen);
  const tabRef = useRef(tab);
  const groupMessageIdsRef = useRef(new Set<string>());
  const { toasts, show } = useToast();

  const chatUnreadCount = Object.values(unreadByPeer).reduce((sum, n) => sum + n, 0);

  function resolveUsername(userId: string) {
    if (peerRef.current?.id === userId) return peerRef.current.username;
    const conv = conversationsRef.current.find((c) => c.peerId === userId);
    return conv?.peerUsername ?? userId.slice(0, 8);
  }

  const addMessage = useCallback((msg: DisplayMessage) => {
    if (messageIdsRef.current.has(msg.id)) return;
    messageIdsRef.current.add(msg.id);
    setMessages((prev) => sortMessages(dedupeMessages([...prev, msg])));
    setPreviews((prev) => ({
      ...prev,
      [peer?.id ?? ""]: previewText(msg),
    }));
  }, [peer?.id]);

  const handleIncoming = useCallback(
    async (envelope: import("@vaultchat/protocol").MessageEnvelope) => {
      const device = deviceRef.current;
      if (!device || !session) return;

      if (inboxRef.current.hasProcessed(envelope.id)) return;
      inboxRef.current.markProcessed(envelope.id);

      const peerId = inboxRef.current.peerIdForEnvelope(envelope, session.userId);

      try {
        const display = await decryptEnvelope(
          device,
          envelope,
          session.userId,
          decryptOpts(session.userId, session.deviceId)
        );

        if (display.status !== "decrypt_failed") {
          persistDevice(device, session.userId);
        }

        if (await captureGroupKeyFromContent(webStorage, session.userId, display.content)) {
          show("Group encryption key received", "info");
          const gk =
            display.content.type === "group_key" ? display.content.groupKey : undefined;
          if (gk && activeGroupRef.current?.id === gk.groupId && session) {
            setGroupHasKey(true);
            void loadGroupMessages(session.token, gk.groupId, session.userId).then(
              (loaded) => {
                for (const m of loaded) groupMessageIdsRef.current.add(m.id);
                setGroupMessages(loaded);
              }
            );
          }
          return;
        }

        setPreviews((p) => ({ ...p, [peerId]: previewText(display) }));

        const viewingConversation =
          screenRef.current === "conversation" && peerRef.current?.id === peerId;

        if (viewingConversation) {
          addMessage(display);
          readStateRef.current?.markPeerRead(peerId, envelope.createdAt);
        } else if (
          readStateRef.current &&
          inboxRef.current.shouldIncrementUnread(envelope, session.userId, readStateRef.current, {
            isViewingPeer: false,
            decryptFailed: display.status === "decrypt_failed",
          })
        ) {
          setUnreadByPeer((prev) => ({
            ...prev,
            [peerId]: (prev[peerId] ?? 0) + 1,
          }));
          const senderName = resolveUsername(peerId);
          if (tabRef.current !== "chats" || screenRef.current !== "list") {
            show(`New message from @${senderName}`, "info");
          }
        }

        if (screenRef.current === "list") {
          void refreshConversations(session.token);
        }
      } catch {
        show("Failed to decrypt message", "error");
      }
    },
    [session, addMessage, show]
  );

  const handleServerEvent = useCallback(
    (event: WsServerEvent) => {
      callsRef.current?.handleServerEvent(event);
      friendsRef.current?.handleServerEvent(event);
      if (event.type === "group_message" && session) {
        const g = activeGroupRef.current;
        if (g && event.envelope.groupId === g.id) {
          if (groupMessageIdsRef.current.has(event.envelope.id)) return;
          void decryptIncomingGroupMessage(g.id, event.envelope, session.userId).then(
            (msg) => {
              groupMessageIdsRef.current.add(msg.id);
              setGroupMessages((prev) => [...prev, msg]);
            }
          );
        }
      }
    },
    [session]
  );

  const { connectionState, isConnected, send } = useGateway(session?.token ?? null, {
    onMessage: handleIncoming,
    onServerEvent: handleServerEvent,
    onAuthOk: () => {
      void (async () => {
        if (!session) return;
        try {
          const { messages } = await fetchInbox(session.token);
          for (const envelope of messages) {
            if (inboxRef.current.hasProcessed(envelope.id)) continue;
            const peerId = inboxRef.current.peerIdForEnvelope(envelope, session.userId);
            if (readStateRef.current?.isPeerMessageRead(peerId, envelope.createdAt)) {
              inboxRef.current.markProcessed(envelope.id);
              continue;
            }
            await handleIncoming(envelope);
          }
        } catch {
          // non-fatal offline catch-up
        }
      })();
    },
    onAuthError: () => {
      handleLogout();
      show("Session expired. Please sign in again.", "error");
    },
  });

  const calls = useCallSession({
    session,
    send,
    isConnected,
    resolveUsername,
    onToast: show,
  });

  const friends = useFriends({
    token: session?.token ?? null,
    onToast: show,
  });

  useEffect(() => {
    callsRef.current = calls;
    friendsRef.current = friends;
  }, [calls, friends]);

  conversationsRef.current = conversations;
  peerRef.current = peer;
  activeGroupRef.current = activeGroup;
  screenRef.current = screen;
  tabRef.current = tab;

  const friendsUnreadCount = friends.unreadCount;
  const callActive = calls.inCall;
  const showCallOverlay =
    calls.inCall && calls.phase !== "incoming" && calls.callPeer !== null;

  async function refreshConversations(token: string) {
    try {
      const { conversations: list } = await fetchConversations(token);
      setConversations(list);
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 401) {
        handleLogout();
        show("Session expired. Please register again.", "error");
      }
    }
  }

  async function refreshGroups(token: string) {
    try {
      setGroups(await fetchGroups(token));
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 401) {
        handleLogout();
        show("Session expired. Please register again.", "error");
      }
    }
  }

  async function initDevice(sess: StoredSession) {
    const device = await bootstrapDevice(webStorage, sess);
    deviceRef.current = device;
  }

  useEffect(() => {
    const sess = loadSession();
    if (!sess) return;
    setSession(sess);
    readStateRef.current = new ReadStateManager(webStorage, sess.userId, { token: sess.token });
    setLoading(true);
    void (async () => {
      try {
        await readStateRef.current?.load();
        const me = await fetchMe(sess.token);
        const updated = { ...sess, emailVerified: me.emailVerified };
        if (me.emailVerified !== sess.emailVerified) {
          saveSession(updated);
        }
        setSession(updated);
        if (!readStateRef.current) {
          readStateRef.current = new ReadStateManager(webStorage, updated.userId, {
            token: updated.token,
          });
        }
        await readStateRef.current.load();
        if (!me.emailVerified) {
          setLoading(false);
          return;
        }
        await initDevice(updated);
        void registerWebPush(updated.token);
        await refreshConversations(updated.token);
        await refreshGroups(updated.token);
      } catch (err) {
        setInitError(friendlyError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleRegister() {
    const errors = validateRegistrationFields(registerFields);
    if (hasFieldErrors(errors)) {
      setRegisterErrors(errors);
      return;
    }
    setRegisterErrors({});
    setLoading(true);

    try {
      const fields = normalizeRegistrationFields(registerFields);
      const device = await VaultDevice.create(fields.username);
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

      const linked = await VaultDevice.restore(reg.userId, reg.deviceId, device.exportState());
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
      saveSession(stored, fields.email);
      persistDevice(linked, reg.userId);
      try {
        await mergeAndUploadAccountBackup(reg.token, fields.password, linked);
      } catch {
        // non-fatal
      }
      readStateRef.current = new ReadStateManager(webStorage, stored.userId, { token: stored.token });
      await readStateRef.current.load();
      setSession(stored);
      show("Check your email to verify your account.", "info");
    } catch (e) {
      setRegisterErrors(mapRegistrationError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    const errors: LoginFieldErrors = {};
    if (!loginIdentifier.trim()) errors.identifier = "Username or email is required.";
    if (!loginPassword) errors.password = "Password is required.";
    if (hasFieldErrors(errors)) {
      setLoginErrors(errors);
      return;
    }
    setLoginErrors({});
    setLoading(true);

    const identifier = loginIdentifier.trim().toLowerCase();
    const hint = getLoginHint(identifier);

    try {
      const preLogin = await loginOnServer({
        identifier,
        password: loginPassword,
        deviceId: hint?.deviceId ?? 1,
      });

      const { login, device } = await provisionDeviceForLogin(webStorage, {
        identifier,
        password: loginPassword,
        userId: preLogin.userId,
        deviceIdHint: hint?.deviceId ?? preLogin.deviceId,
        token: preLogin.token,
        deviceName: "Web",
      });

      deviceRef.current = device;
      const stored: StoredSession = {
        username: login.username,
        userId: login.userId,
        token: login.token,
        deviceId: login.deviceId,
        emailVerified: login.emailVerified,
      };
      saveSession(stored, identifier.includes("@") ? identifier : undefined);
      persistDevice(device, login.userId);
      readStateRef.current = new ReadStateManager(webStorage, stored.userId, { token: stored.token });
      await readStateRef.current.load();
      setSession(stored);
      await initDevice(stored);
      await refreshConversations(stored.token);
      await refreshGroups(stored.token);
      show(`Welcome back, @${stored.username}!`, "info");
    } catch (e) {
      setLoginErrors(mapLoginError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthSubmit() {
    if (authMode === "register") {
      await handleRegister();
    } else {
      await handleLogin();
    }
  }

  async function handleResendVerification() {
    if (!session) return;
    setResendingVerification(true);
    try {
      await resendVerificationEmail(session.token);
      show("Verification email sent.", "info");
    } catch (e) {
      show(friendlyError(e), "error");
    } finally {
      setResendingVerification(false);
    }
  }

  async function handleCheckVerified() {
    if (!session) return;
    try {
      const me = await fetchMe(session.token);
      if (me.emailVerified) {
        const updated = { ...session, emailVerified: true };
        saveSession(updated);
        setSession(updated);
        await initDevice(updated);
        void registerWebPush(updated.token);
        await refreshConversations(updated.token);
        await refreshGroups(updated.token);
        show("Email verified! You can use VaultChat now.", "info");
      } else {
        show("Email not verified yet. Check your inbox.", "error");
      }
    } catch (e) {
      show(friendlyError(e), "error");
    }
  }

  function handleLogout() {
    void readStateRef.current?.clear();
    clearSession();
    setSession(null);
    deviceRef.current = null;
    messageIdsRef.current.clear();
    inboxRef.current.clearProcessed();
    readStateRef.current = null;
    setMessages([]);
    setConversations([]);
    setPeer(null);
    setActiveGroup(null);
    setGroupMessages([]);
    setScreen("list");
    setTab("chats");
    setInitError(null);
  }

  async function openConversation(peerId: string, peerUsername: string) {
    if (!session) return;
    const conv = conversations.find((c) => c.peerId === peerId);
    if (conv) readStateRef.current?.markPeerRead(peerId, conv.lastMessageAt);
    setUnreadByPeer((prev) => {
      if (!prev[peerId]) return prev;
      const { [peerId]: _, ...rest } = prev;
      return rest;
    });
    setPeer({ id: peerId, username: peerUsername });
    setScreen("conversation");
    setMessages([]);
    messageIdsRef.current.clear();
    setMessageCursor(undefined);
    setHasMoreMessages(false);
    setLoading(true);

    try {
      const { messages: envelopes, cursor, hasMore } = await fetchConversation(
        session.token,
        peerId,
        { limit: 50 }
      );
      const device = deviceRef.current!;
      const decrypted: DisplayMessage[] = [];

      for (const envelope of envelopes) {
        inboxRef.current.markProcessed(envelope.id);
        const display = await decryptEnvelope(
          device,
          envelope,
          session.userId,
          historyDecryptOptions(webStorage, session.userId, envelope, session.userId, session.deviceId)
        );
        decrypted.push(display);
        messageIdsRef.current.add(display.id);
      }

      setMessages(sortMessages(decrypted));
      setMessageCursor(cursor);
      setHasMoreMessages(Boolean(hasMore));

      const last = decrypted[decrypted.length - 1];
      if (last) {
        setPreviews((p) => ({ ...p, [peerId]: previewText(last) }));
        readStateRef.current?.markPeerRead(peerId, last.time);
      }
    } catch (e) {
      show(friendlyError(e), "error");
      setScreen("list");
      setPeer(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadOlderMessages() {
    if (!session || !peer || !messageCursor || loadingOlder || !hasMoreMessages) return;
    setLoadingOlder(true);
    try {
      const { messages: envelopes, cursor, hasMore } = await fetchConversation(
        session.token,
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
          session.userId,
          historyDecryptOptions(webStorage, session.userId, envelope, session.userId, session.deviceId)
        );
        older.push(display);
        messageIdsRef.current.add(display.id);
      }
      setMessages((prev) => sortMessages(dedupeMessages([...older, ...prev])));
      setMessageCursor(cursor);
      setHasMoreMessages(Boolean(hasMore));
    } catch (e) {
      show(friendlyError(e), "error");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function openCommunity(communityId: string, communityName: string) {
    if (!session) return;
    setActiveCommunity({ id: communityId, name: communityName });
    setScreen("community");
    setLoading(true);
    try {
      const [ch, cats] = await Promise.all([
        fetchCommunityChannels(session.token, communityId),
        fetchChannelCategories(session.token, communityId),
      ]);
      setCommunityChannels(ch.channels);
      setCommunityCategories(cats.categories);
      const general = ch.channels.find((c) => c.name === "general" && c.type === "text");
      if (general) setActiveChannel(general);
    } catch (e) {
      show(friendlyError(e), "error");
      setScreen("list");
      setActiveCommunity(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleNewChat() {
    if (!session) return;
    const name = search.trim().toLowerCase();
    const validation = validateUsername(name);
    if (validation) {
      show(validation, "error");
      return;
    }
    if (name === session.username) {
      show("You can't message yourself.", "error");
      return;
    }

    setLoading(true);
    try {
      const user = await lookupUser(name);
      setSearch("");
      await openConversation(user.id, user.username);
    } catch (e) {
      show(friendlyError(e), "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!session || !peer || !draft.trim()) return;
    const device = deviceRef.current;
    if (!device) {
      show("Device keys missing. Please log out and register again.", "error");
      return;
    }

    const text = draft.trim();
    setDraft("");
    setSending(true);

    const optimisticId = crypto.randomUUID();
    const optimistic: DisplayMessage = {
      id: optimisticId,
      from: "me",
      content: { type: "text", text },
      time: new Date().toISOString(),
      date: "Today",
      status: "sent",
    };
    addMessage(optimistic);

    try {
      const [peerBundles, ownBundles] = await Promise.all([
        fetchRecipientDeviceBundles(peer.id),
        fetchOwnDeviceBundles(session.token, session.userId),
      ]);
      const { recipientPayload, recipientCiphertexts, senderCiphertexts } =
        await encryptOutgoingMessage(
        device,
        session.userId,
        peer.id,
        { type: "text", text },
        peerBundles,
        ownBundles
      );
      const result = await sendEncryptedMessage(
        session.token,
        peer.id,
        recipientPayload,
        "text",
        undefined,
        peerBundles[0]?.deviceId ?? 1,
        senderCiphertexts,
        recipientCiphertexts
      );
      persistDevice(device, session.userId);

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
          dedupeMessages(
            prev.map((m) => (m.id === optimisticId ? sentMessage : m))
          )
        )
      );
      messageIdsRef.current.add(result.messageId);
      await cacheDecryptedMessage(webStorage, session.userId, sentMessage);
      setPreviews((p) => ({ ...p, [peer.id]: text }));
      void refreshConversations(session.token);
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, status: "failed" as const } : m
        )
      );
      show(friendlyError(e), "error");
    } finally {
      setSending(false);
    }
  }

  async function handleAttachFile(file: File) {
    if (!session || !peer) return;
    const device = deviceRef.current;
    if (!device) return;

    setSending(true);
    try {
      const bytes = await file.arrayBuffer();
      const { content, messageType } = await prepareMediaMessage(
        session.token,
        bytes,
        file.type || "application/octet-stream"
      );
      const [peerBundles, ownBundles] = await Promise.all([
        fetchRecipientDeviceBundles(peer.id),
        fetchOwnDeviceBundles(session.token, session.userId),
      ]);
      const { recipientPayload, recipientCiphertexts, senderCiphertexts } =
        await encryptOutgoingMessage(
        device,
        session.userId,
        peer.id,
        content,
        peerBundles,
        ownBundles
      );
      const result = await sendEncryptedMessage(
        session.token,
        peer.id,
        recipientPayload,
        messageType,
        undefined,
        peerBundles[0]?.deviceId ?? 1,
        senderCiphertexts,
        recipientCiphertexts
      );
      persistDevice(device, session.userId);

      const display: DisplayMessage = {
        id: result.messageId,
        from: "me",
        content,
        time: result.createdAt,
        date: formatMessageDate(result.createdAt),
        status: "sent",
      };
      addMessage(display);
      await cacheDecryptedMessage(webStorage, session.userId, display);
      setPreviews((p) => ({ ...p, [peer.id]: previewText(display) }));
      void refreshConversations(session.token);
      if (content.type === "media") {
        show("Large file encrypted and uploaded", "info");
      }
    } catch (e) {
      show(friendlyError(e), "error");
    } finally {
      setSending(false);
    }
  }

  async function handleCreateGroup() {
    if (!session || !deviceRef.current || !groupNameInput.trim()) return;
    setCreatingGroup(true);
    try {
      const memberUsernames = groupMembersInput
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const group = await createGroupWithKey(
        session.token,
        deviceRef.current,
        session.userId,
        groupNameInput.trim(),
        memberUsernames
      );
      setGroupNameInput("");
      setGroupMembersInput("");
      await refreshGroups(session.token);
      await openGroup(group.id, group.name);
    } catch (e) {
      show(friendlyError(e), "error");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function openGroup(groupId: string, groupName: string) {
    if (!session) return;
    setActiveGroup({ id: groupId, name: groupName });
    setScreen("group-conversation");
    setGroupMessages([]);
    groupMessageIdsRef.current.clear();
    setLoading(true);
    try {
      const access = await getGroupAccess(session.token, groupId, session.userId);
      setGroupIsAdmin(access.isAdmin);
      setGroupHasKey(access.hasKey);
      const loaded = await loadGroupMessages(session.token, groupId, session.userId);
      for (const m of loaded) groupMessageIdsRef.current.add(m.id);
      setGroupMessages(loaded);
    } catch (e) {
      show(friendlyError(e), "error");
      setScreen("list");
      setActiveGroup(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleReshareGroupKey() {
    if (!session || !activeGroup || !deviceRef.current) return;
    setResharingGroup(true);
    try {
      const { sharedWith } = await adminReshareGroupKey(
        session.token,
        deviceRef.current,
        session.userId,
        activeGroup.id
      );
      show(`Encryption key sent to ${sharedWith} member(s) via encrypted DM`, "info");
    } catch (e) {
      show(friendlyError(e), "error");
    } finally {
      setResharingGroup(false);
    }
  }

  async function handleAttachGroupFile(file: File) {
    if (!session || !activeGroup || !groupHasKey) return;
    setSending(true);
    try {
      const bytes = await file.arrayBuffer();
      const { content, messageType } = await prepareMediaMessage(
        session.token,
        bytes,
        file.type || "application/octet-stream"
      );
      const result = await sendGroupMediaMessage(
        session.token,
        session.userId,
        activeGroup.id,
        content,
        messageType
      );
      setGroupMessages((prev) => [
        ...prev,
        {
          id: result.messageId,
          from: "me",
          text: messageType === "video" ? "🎬 Video" : "📷 Photo",
          content,
          time: result.createdAt,
          date: "Today",
        },
      ]);
      groupMessageIdsRef.current.add(result.messageId);
    } catch (e) {
      show(friendlyError(e), "error");
    } finally {
      setSending(false);
    }
  }

  async function handleSendGroupMessage() {
    if (!session || !activeGroup || !groupDraft.trim()) return;
    const text = groupDraft.trim();
    setGroupDraft("");
    setSending(true);
    const optimisticId = crypto.randomUUID();
    setGroupMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        text,
        content: { type: "text", text },
        from: "me",
        time: new Date().toISOString(),
        date: "Today",
      },
    ]);
    try {
      const result = await sendGroupTextMessage(
        session.token,
        session.userId,
        activeGroup.id,
        text
      );
      setGroupMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, id: result.messageId, time: result.createdAt } : m
        )
      );
    } catch (e) {
      setGroupMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, failed: true } : m))
      );
      show(friendlyError(e), "error");
    } finally {
      setSending(false);
    }
  }

  async function handleVerify() {
    if (!session || !peer || !deviceRef.current) return;
    try {
      const bundle = await fetchPreKeyBundle(peer.id);
      const material = await deviceRef.current.exportKeyMaterial();
      const number = await generateSafetyNumber(
        session.userId,
        material.identityKeyPublic,
        peer.id,
        bundle.identityKey
      );
      setSafetyNumber(number);
    } catch (e) {
      show(friendlyError(e), "error");
    }
  }

  if (!session) {
    return (
      <div className="vc-app">
        <AuthScreen
          mode={authMode}
          onModeChange={(mode) => {
            setAuthMode(mode);
            setRegisterErrors({});
            setLoginErrors({});
          }}
          registerFields={registerFields}
          onRegisterFieldChange={(key, value) => {
            setRegisterFields((prev) => ({ ...prev, [key]: value }));
            setRegisterErrors((prev) => {
              const next = { ...prev };
              delete next[key];
              delete next.form;
              if (key === "phoneCountry" || key === "phoneNumber") delete next.phoneNumber;
              return next;
            });
          }}
          registerErrors={registerErrors}
          loginIdentifier={loginIdentifier}
          loginPassword={loginPassword}
          onLoginIdentifierChange={(v) => {
            setLoginIdentifier(v);
            setLoginErrors((prev) => {
              const next = { ...prev };
              delete next.identifier;
              delete next.form;
              return next;
            });
          }}
          onLoginPasswordChange={(v) => {
            setLoginPassword(v);
            setLoginErrors((prev) => {
              const next = { ...prev };
              delete next.password;
              delete next.form;
              return next;
            });
          }}
          loginErrors={loginErrors}
          onSubmit={() => void handleAuthSubmit()}
          loading={loading}
        />
        <ToastContainer toasts={toasts} />
      </div>
    );
  }

  if (session && session.emailVerified === false) {
    return (
      <div className="vc-app">
        <VerifyEmailPending
          onResend={() => void handleResendVerification()}
          onLogout={handleLogout}
          resending={resendingVerification}
        />
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button type="button" className="vc-btn vc-btn--ghost" onClick={() => void handleCheckVerified()}>
            I&apos;ve verified my email
          </button>
        </div>
        <ToastContainer toasts={toasts} />
      </div>
    );
  }

  if (initError) {
    return (
      <div className="vc-app">
        <div className="vc-empty">
          <div className="vc-empty__icon">⚠️</div>
          <h2 className="vc-empty__title">Setup error</h2>
          <p className="vc-empty__text">{initError}</p>
          <button type="button" className="vc-btn" style={{ marginTop: "1rem" }} onClick={handleLogout}>
            Reset & register again
          </button>
        </div>
        <ToastContainer toasts={toasts} />
      </div>
    );
  }

  return (
    <div className="vc-app">
      {screen === "list" && (
        <>
          <header className="vc-header">
            <button
              type="button"
              className="vc-header__avatar vc-header__avatar--btn"
              onClick={() => setSettingsOpen(true)}
              title="User settings"
              aria-label="Open user settings"
            >
              {session.username[0]}
            </button>
            <div className="vc-header__info">
              <div className="vc-header__title">{session.username}</div>
              <div
                className={`vc-header__subtitle${
                  isConnected ? " vc-header__subtitle--online" : ""
                }`}
              >
                {isConnected ? "Online" : connectionState === "reconnecting" ? "Reconnecting…" : "Offline"}
              </div>
            </div>
            <div className="vc-header__actions">
              <button
                type="button"
                className="vc-icon-btn"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
                aria-label="Settings"
              >
                ⚙
              </button>
              <button
                type="button"
                className="vc-icon-btn"
                onClick={handleLogout}
                title="Log out"
                aria-label="Log out"
              >
                ⏻
              </button>
            </div>
          </header>

          {!isConnected && connectionState !== "connecting" && (
            <div className="vc-banner vc-banner--warning">
              Connection lost — messages will arrive when reconnected
            </div>
          )}

          <div className="vc-tabs">
            <button
              type="button"
              className={`vc-tabs__btn${tab === "chats" ? " vc-tabs__btn--active" : ""}`}
              onClick={() => setTab("chats")}
            >
              <span className="vc-tabs__label">
                Chats
                {chatUnreadCount > 0 && (
                  <span className="vc-tabs__badge" aria-label={`${chatUnreadCount} unread messages`}>
                    {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              className={`vc-tabs__btn${tab === "friends" ? " vc-tabs__btn--active" : ""}`}
              onClick={() => {
                setTab("friends");
              }}
            >
              <span className="vc-tabs__label">
                Friends
                {friendsUnreadCount > 0 && (
                  <span className="vc-tabs__badge" aria-label={`${friendsUnreadCount} friend requests`}>
                    {friendsUnreadCount > 99 ? "99+" : friendsUnreadCount}
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              className={`vc-tabs__btn${tab === "groups" ? " vc-tabs__btn--active" : ""}`}
              onClick={() => {
                setTab("groups");
                if (session) void refreshGroups(session.token);
              }}
            >
              Communities
            </button>
          </div>

          {tab === "chats" ? (
            <ChatList
              conversations={conversations}
              previews={previews}
              unreadByPeer={unreadByPeer}
              search={search}
              onSearchChange={setSearch}
              onSelect={(id, username) => void openConversation(id, username)}
              onNewChat={() => void handleNewChat()}
              loading={loading}
            />
          ) : tab === "friends" ? (
            <FriendsPanel
              authToken={session.token}
              friends={friends.friends}
              incoming={friends.incoming}
              onAddFriend={friends.addFriend}
              onAccept={friends.accept}
              onReject={friends.reject}
              onMessage={(id, username) => void openConversation(id, username)}
            />
          ) : (
            <GroupsList
              groups={groups}
              groupName={groupNameInput}
              groupMembers={groupMembersInput}
              onGroupNameChange={setGroupNameInput}
              onGroupMembersChange={setGroupMembersInput}
              onCreate={() => void handleCreateGroup()}
              onRedeemInvite={async (code) => {
                if (!session) return;
                const result = await redeemInvite(session.token, code);
                await refreshGroups(session.token);
                show(`Joined ${result.communityName}`, "info");
              }}
              onSelect={(id, name) => void openCommunity(id, name)}
              loading={loading}
              creating={creatingGroup}
            />
          )}
        </>
      )}

      {screen === "community" && activeCommunity && (
        <div className="vc-community-layout">
          <CommunitySidebar
            communityName={activeCommunity.name}
            categories={communityCategories}
            channels={communityChannels}
            activeChannelId={activeChannel?.id}
            onSelectChannel={(ch) => {
              setActiveChannel(ch);
              if (ch.type === "voice") {
                show("Voice channels: join from mobile or use 1:1 calls for now.", "info");
              }
            }}
            onBack={() => {
              setScreen("list");
              setTab("groups");
              setActiveCommunity(null);
              setActiveChannel(null);
            }}
          />
          <div className="vc-community-main">
            {activeChannel ? (
              <p className="vc-register__subtitle">
                #{activeChannel.name} — channel chat uses encrypted group keys (open #general via legacy group chat for now).
              </p>
            ) : (
              <p className="vc-register__subtitle">Select a channel</p>
            )}
          </div>
        </div>
      )}

      {screen === "group-conversation" && activeGroup && (
        <GroupConversationView
          groupName={activeGroup.name}
          messages={groupMessages}
          draft={groupDraft}
          onDraftChange={setGroupDraft}
          onSend={() => void handleSendGroupMessage()}
          onAttachFile={(file) => void handleAttachGroupFile(file)}
          onReshareKey={() => void handleReshareGroupKey()}
          onBack={() => {
            setScreen("list");
            setTab("groups");
            setActiveGroup(null);
            setGroupMessages([]);
            setGroupIsAdmin(false);
            setGroupHasKey(true);
          }}
          sending={sending}
          resharing={resharingGroup}
          authToken={session.token}
          isAdmin={groupIsAdmin}
          hasGroupKey={groupHasKey}
        />
      )}

      {screen === "conversation" && peer && (
        <ConversationView
          peerUsername={peer.username}
          messages={messages}
          draft={draft}
          onDraftChange={setDraft}
          onSend={() => void handleSend()}
          onBack={() => {
            if (session && peer && messages.length > 0) {
              const latest = messages.reduce((a, b) =>
                new Date(a.time) > new Date(b.time) ? a : b
              );
              readStateRef.current?.markPeerRead(peer.id, latest.time);
            }
            setUnreadByPeer((prev) => {
              if (!peer || !prev[peer.id]) return prev;
              const { [peer.id]: _, ...rest } = prev;
              return rest;
            });
            setScreen("list");
            setPeer(null);
            setMessages([]);
            messageIdsRef.current.clear();
            if (session) void refreshConversations(session.token);
          }}
          onVerify={() => void handleVerify()}
          onAttachFile={(file) => void handleAttachFile(file)}
          authToken={session.token}
          onVoiceCall={() => peer && void calls.startOutgoing(peer.id, "voice")}
          onVideoCall={() => peer && void calls.startOutgoing(peer.id, "video")}
          callActive={callActive}
          sending={sending}
          connectionState={connectionState}
          onLoadOlder={() => void loadOlderMessages()}
          loadingOlder={loadingOlder}
          hasMore={hasMoreMessages}
        />
      )}

      {calls.incomingCall && (
        <IncomingCallModal
          callerUsername={calls.incomingCall.callerUsername}
          callType={calls.incomingCall.callType}
          onAccept={() => void calls.acceptIncoming()}
          onReject={calls.rejectIncoming}
        />
      )}

      {showCallOverlay && calls.callPeer && (
        <ActiveCallOverlay
          phase={calls.phase}
          callType={calls.callType}
          peerUsername={calls.callPeer.username}
          localStream={calls.localStream}
          remoteStream={calls.remoteStream}
          onEnd={calls.endCall}
          onToggleMute={calls.toggleMute}
          onToggleCamera={calls.toggleCamera}
        />
      )}

      {safetyNumber && peer && (
        <SafetyNumbersModal
          peerUsername={peer.username}
          safetyNumber={safetyNumber}
          onClose={() => setSafetyNumber(null)}
        />
      )}

      {session && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          token={session.token}
          username={session.username}
          onLogout={() => {
            setSettingsOpen(false);
            handleLogout();
          }}
          onShowToast={show}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
