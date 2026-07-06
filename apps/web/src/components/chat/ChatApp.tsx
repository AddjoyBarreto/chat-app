"use client";

import {
  CallSession,
  captureGroupKeyFromContent,
  cacheDecryptedMessage,
  createLocalStorageAdapter,
  fetchGroups,
  fetchInbox,
  fetchOwnDeviceBundles,
  prepareMediaMessage,
  replenishPreKeysIfNeeded,
  repairServerPreKeysIfNeeded,
  syncIdentityWithServer,
  type CallPhase,
} from "@vaultchat/client";
import { generateSafetyNumber, VaultDevice } from "@vaultchat/crypto";
import type { CallType, ChannelInfo, ConversationPreview, FriendInfo, FriendRequestInfo, GroupInfo, WsServerEvent } from "@vaultchat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
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
  fetchFriends,
  fetchFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
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
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestInfo[]>([]);
  const [unreadByPeer, setUnreadByPeer] = useState<Record<string, number>>({});
  const [activeCommunity, setActiveCommunity] = useState<{ id: string; name: string } | null>(null);
  const [communityChannels, setCommunityChannels] = useState<ChannelInfo[]>([]);
  const [communityCategories, setCommunityCategories] = useState<import("@vaultchat/protocol").ChannelCategoryInfo[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChannelInfo | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
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
  const processedEnvelopeIdsRef = useRef(new Set<string>());
  const callSessionRef = useRef<CallSession | null>(null);
  const conversationsRef = useRef(conversations);
  const peerRef = useRef(peer);
  const activeGroupRef = useRef(activeGroup);
  const screenRef = useRef(screen);
  const tabRef = useRef(tab);
  const groupMessageIdsRef = useRef(new Set<string>());
  const { toasts, show } = useToast();

  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [callType, setCallType] = useState<CallType>("voice");
  const [callPeer, setCallPeer] = useState<{ id: string; username: string } | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    callerId: string;
    callerUsername: string;
    callType: CallType;
  } | null>(null);

  conversationsRef.current = conversations;
  peerRef.current = peer;
  activeGroupRef.current = activeGroup;
  screenRef.current = screen;
  tabRef.current = tab;

  const chatUnreadCount = Object.values(unreadByPeer).reduce((sum, n) => sum + n, 0);
  const friendsUnreadCount = incomingRequests.length;

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

      if (processedEnvelopeIdsRef.current.has(envelope.id)) return;
      processedEnvelopeIdsRef.current.add(envelope.id);

      const peerId = envelope.senderId === session.userId ? envelope.recipientId : envelope.senderId;

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
        } else if (
          envelope.senderId !== session.userId &&
          display.status !== "decrypt_failed"
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
      void callSessionRef.current?.handleServerEvent(event);
      if (event.type === "friend_request" && session) {
        setIncomingRequests((prev) => {
          if (prev.some((r) => r.id === event.request.id)) return prev;
          return [...prev, event.request];
        });
        if (tabRef.current !== "friends") {
          show(`Friend request from @${event.request.senderUsername}`, "info");
        }
      }
      if (event.type === "friend_accept" && session) {
        void refreshFriends(session.token);
      }
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
      if (event.type === "error" && event.error === "User offline") {
        show("User is offline", "error");
      }
    },
    [session, show]
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

  useEffect(() => {
    if (!session) {
      callSessionRef.current = null;
      return;
    }

    const callSession = new CallSession({
      token: session.token,
      selfUserId: session.userId,
      sendWs: send,
      onPhaseChange: (phase, callId) => {
        setCallPhase(phase);
        const cs = callSessionRef.current;
        if (phase === "incoming" && cs && callId) {
          const callerId = cs.getPeerId();
          if (callerId) {
            setIncomingCall({
              callId,
              callerId,
              callerUsername: resolveUsername(callerId),
              callType: cs.getCallType(),
            });
          }
        }
        if (phase === "idle" || phase === "ended") {
          setIncomingCall(null);
          if (phase === "idle") {
            setCallPeer(null);
            setLocalStream(null);
            setRemoteStream(null);
          }
        }
        if (
          (phase === "outgoing" || phase === "connecting" || phase === "active") &&
          cs
        ) {
          const peerId = cs.getPeerId();
          if (peerId) {
            setCallPeer({ id: peerId, username: resolveUsername(peerId) });
            setCallType(cs.getCallType());
          }
        }
      },
      onRemoteStream: setRemoteStream,
      onLocalStream: setLocalStream,
      onError: (msg) => show(msg, "error"),
    });
    callSessionRef.current = callSession;

    return () => {
      void callSession.endCall();
      callSessionRef.current = null;
    };
  }, [session?.token, session?.userId, send, show]);

  async function startCall(type: CallType) {
    if (!peer || !callSessionRef.current || callPhase !== "idle") return;
    try {
      await callSessionRef.current.startOutgoing(peer.id, type);
    } catch (e) {
      show(friendlyError(e), "error");
    }
  }

  async function acceptIncomingCall() {
    if (!incomingCall || !callSessionRef.current) return;
    setIncomingCall(null);
    try {
      await callSessionRef.current.acceptIncoming(
        incomingCall.callId,
        incomingCall.callerId,
        incomingCall.callType
      );
    } catch (e) {
      show(friendlyError(e), "error");
    }
  }

  function rejectIncomingCall() {
    if (!incomingCall || !callSessionRef.current) return;
    callSessionRef.current.rejectIncoming(incomingCall.callId);
    setIncomingCall(null);
  }

  function endCall() {
    void callSessionRef.current?.endCall();
  }

  const callActive = callPhase !== "idle" && callPhase !== "ended";
  const showCallOverlay =
    callActive && callPhase !== "incoming" && callPeer !== null;

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

  async function refreshFriends(token: string) {
    try {
      const [{ friends: list }, requests] = await Promise.all([
        fetchFriends(token),
        fetchFriendRequests(token),
      ]);
      setFriends(list);
      setIncomingRequests(requests.incoming);
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 401) {
        handleLogout();
        show("Session expired. Please register again.", "error");
      }
    }
  }

  async function initDevice(sess: StoredSession) {
    const device = await loadOrCreateDevice(sess);
    deviceRef.current = device;
    const repaired = await repairServerPreKeysIfNeeded(
      webStorage,
      device,
      sess.token,
      sess.userId
    );
    if (repaired) show("Encryption keys repaired on server", "info");
    const replenished = await replenishPreKeysIfNeeded(
      webStorage,
      device,
      sess.token,
      sess.userId
    );
    if (replenished) show("Encryption keys refreshed", "info");
  }

  useEffect(() => {
    const sess = loadSession();
    if (!sess) return;
    setSession(sess);
    setLoading(true);
    void (async () => {
      try {
        const me = await fetchMe(sess.token);
        const updated = { ...sess, emailVerified: me.emailVerified };
        if (me.emailVerified !== sess.emailVerified) {
          saveSession(updated);
        }
        setSession(updated);
        if (!me.emailVerified) {
          setLoading(false);
          return;
        }
        await initDevice(updated);
        await refreshConversations(updated.token);
        await refreshGroups(updated.token);
        await refreshFriends(updated.token);
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
      persistDevice(device, reg.userId);
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
      let login = await loginOnServer({
        identifier,
        password: loginPassword,
        deviceId: hint?.deviceId ?? 1,
      });

      let device: VaultDevice;
      try {
        device = await loadOrCreateDevice({
          username: login.username,
          userId: login.userId,
          token: login.token,
          deviceId: login.deviceId,
          emailVerified: login.emailVerified,
        });
      } catch {
        device = await VaultDevice.create(login.username);
      }

      const synced = await syncIdentityWithServer(webStorage, device, {
        identifier,
        password: loginPassword,
        deviceId: login.deviceId,
        userId: login.userId,
      });
      login = synced.login;
      device = synced.device;

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
      setSession(stored);
      await initDevice(stored);
      await refreshConversations(stored.token);
      await refreshGroups(stored.token);
      await refreshFriends(stored.token);
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
        await refreshConversations(updated.token);
        await refreshGroups(updated.token);
        await refreshFriends(updated.token);
        show("Email verified! You can use VaultChat now.", "info");
      } else {
        show("Email not verified yet. Check your inbox.", "error");
      }
    } catch (e) {
      show(friendlyError(e), "error");
    }
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    deviceRef.current = null;
    messageIdsRef.current.clear();
    processedEnvelopeIdsRef.current.clear();
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
        processedEnvelopeIdsRef.current.add(envelope.id);
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
      const [peerBundle, ownBundles] = await Promise.all([
        fetchPreKeyBundle(peer.id),
        fetchOwnDeviceBundles(session.token, session.userId),
      ]);
      const { recipientPayload, senderCiphertexts } = await encryptOutgoingMessage(
        device,
        session.userId,
        peer.id,
        { type: "text", text },
        peerBundle,
        ownBundles
      );
      const result = await sendEncryptedMessage(
        session.token,
        peer.id,
        recipientPayload,
        "text",
        undefined,
        peerBundle.deviceId,
        senderCiphertexts
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
      const [peerBundle, ownBundles] = await Promise.all([
        fetchPreKeyBundle(peer.id),
        fetchOwnDeviceBundles(session.token, session.userId),
      ]);
      const { recipientPayload, senderCiphertexts } = await encryptOutgoingMessage(
        device,
        session.userId,
        peer.id,
        content,
        peerBundle,
        ownBundles
      );
      const result = await sendEncryptedMessage(
        session.token,
        peer.id,
        recipientPayload,
        messageType,
        undefined,
        peerBundle.deviceId,
        senderCiphertexts
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
            <div className="vc-header__avatar">{session.username[0]}</div>
            <div className="vc-header__info">
              <div className="vc-header__title">VaultChat</div>
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
                if (session) void refreshFriends(session.token);
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
              friends={friends}
              incoming={incomingRequests}
              onAddFriend={async (username) => {
                if (!session) return;
                await sendFriendRequest(session.token, username);
                await refreshFriends(session.token);
                show("Friend request sent.", "info");
              }}
              onAccept={async (requestId) => {
                if (!session) return;
                await acceptFriendRequest(session.token, requestId);
                await refreshFriends(session.token);
              }}
              onReject={async (requestId) => {
                if (!session) return;
                await rejectFriendRequest(session.token, requestId);
                await refreshFriends(session.token);
              }}
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
            setScreen("list");
            setPeer(null);
            setMessages([]);
            messageIdsRef.current.clear();
            if (session) void refreshConversations(session.token);
          }}
          onVerify={() => void handleVerify()}
          onAttachFile={(file) => void handleAttachFile(file)}
          authToken={session.token}
          onVoiceCall={() => void startCall("voice")}
          onVideoCall={() => void startCall("video")}
          callActive={callActive}
          sending={sending}
          connectionState={connectionState}
          onLoadOlder={() => void loadOlderMessages()}
          loadingOlder={loadingOlder}
          hasMore={hasMoreMessages}
        />
      )}

      {incomingCall && (
        <IncomingCallModal
          callerUsername={incomingCall.callerUsername}
          callType={incomingCall.callType}
          onAccept={() => void acceptIncomingCall()}
          onReject={rejectIncomingCall}
        />
      )}

      {showCallOverlay && callPeer && (
        <ActiveCallOverlay
          phase={callPhase}
          callType={callType}
          peerUsername={callPeer.username}
          localStream={localStream}
          remoteStream={remoteStream}
          onEnd={endCall}
        />
      )}

      {safetyNumber && peer && (
        <SafetyNumbersModal
          peerUsername={peer.username}
          safetyNumber={safetyNumber}
          onClose={() => setSafetyNumber(null)}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
