import { generateSafetyNumber } from "@vaultchat/crypto";
import {
  decryptEnvelope,
  dedupeMessages,
  encryptOutgoingMessage,
  fetchConversation,
  listOwnOtherDeviceIds,
  listRecipientDeviceIds,
  fetchPreKeyBundle,
  formatMessageDate,
  friendlyError,
  historyDecryptOptions,
  mergeConversationTimeline,
  OWN_UNAVAILABLE_TEXT,
  PEER_UNAVAILABLE_TEXT,
  persistDevice,
  persistOwnDirectMessage,
  scheduleAccountBackupRefresh,
  sendEncryptedMessage,
  sortMessages,
  syncConversationWithCache,
  type DisplayMessage,
} from "@vaultchat/client";
import type { MessageEnvelope } from "@vaultchat/protocol";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp, storage } from "@/context/AppContext";
import { useCall } from "@/context/CallContext";
import { MediaBubble } from "@/components/MediaBubble";
import { ChatComposer } from "@/components/ChatComposer";
import { MarkdownText } from "@/components/MarkdownText";
import { ChatScreenLayout } from "@/components/ChatScreenLayout";
import { pickAndPrepareMedia } from "@/lib/media";
import { ensureMobileCrypto } from "@/lib/mobileCrypto";
import { callsSupported } from "@/lib/webrtc";
import { theme } from "@/theme";

export default function ConversationScreen() {
  const { peerId, peerUsername, draft: draftParam } = useLocalSearchParams<{
    peerId: string;
    peerUsername: string;
    draft?: string;
  }>();
  const { session, device, onMessageHandlers, refreshConversations, conversations, setActivePeer, markConversationRead } = useApp();
  const { canCall, startOutgoing } = useCall();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState(typeof draftParam === "string" ? draftParam : "");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messageCursor, setMessageCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const messageIds = useRef(new Set<string>());

  useLayoutEffect(() => {
    navigation.setOptions({
      title: peerUsername ? `@${peerUsername}` : "Chat",
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginRight: 8 }}>
          {callsSupported() && peerId && peerUsername && (
            <>
              <TouchableOpacity
                onPress={() => void startOutgoing(peerId, peerUsername, "voice")}
                disabled={!canCall}
                style={{ opacity: canCall ? 1 : 0.4 }}
              >
                <Text style={{ fontSize: 20 }}>📞</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void startOutgoing(peerId, peerUsername, "video")}
                disabled={!canCall}
                style={{ opacity: canCall ? 1 : 0.4 }}
              >
                <Text style={{ fontSize: 20 }}>📹</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={() => void showSafetyNumbers()}>
            <Text style={{ fontSize: 20 }}>🛡️</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, peerUsername, peerId, canCall, startOutgoing]);

  const addMessage = useCallback((msg: DisplayMessage) => {
    if (messageIds.current.has(msg.id)) return;
    messageIds.current.add(msg.id);
    setMessages((prev) => sortMessages(dedupeMessages([...prev, msg])));
    if (session?.userId && peerId) {
      void mergeConversationTimeline(storage, session.userId, peerId, [msg]);
    }
  }, [session?.userId, peerId]);

  const handleIncoming = useCallback(
    (display: DisplayMessage, envelope: MessageEnvelope) => {
      if (!session || !peerId) return;
      const relevant =
        (envelope.senderId === peerId && envelope.recipientId === session.userId) ||
        (envelope.senderId === session.userId && envelope.recipientId === peerId);
      if (!relevant) return;
      if (display.content.type === "group_key") return;
      addMessage(display);
      markConversationRead(peerId, envelope.createdAt);
      void refreshConversations();
    },
    [session, peerId, addMessage, refreshConversations, markConversationRead]
  );

  useEffect(() => {
    if (!peerId) return;
    setActivePeer(peerId);
    const conv = conversations.find((c) => c.peerId === peerId);
    if (conv) markConversationRead(peerId, conv.lastMessageAt);
    return () => setActivePeer(null);
  }, [peerId, conversations, setActivePeer, markConversationRead]);

  useEffect(() => {
    onMessageHandlers.current.add(handleIncoming);
    return () => {
      onMessageHandlers.current.delete(handleIncoming);
    };
  }, [handleIncoming, onMessageHandlers]);

  useEffect(() => {
    if (!session || !device || !peerId) return;
    let cancelled = false;
    const isCurrent = () => !cancelled;
    void (async () => {
      setLoading(true);
      setMessages([]);
      messageIds.current.clear();
      try {
        const { messages: synced, cursor, hasMore: more } = await syncConversationWithCache({
          storage,
          device,
          token: session.token,
          userId: session.userId,
          deviceId: session.deviceId,
          peerId,
          limit: 50,
          isCurrent,
          onHydrated: (cached) => {
            if (cancelled) return;
            for (const m of cached) messageIds.current.add(m.id);
            setMessages(cached);
            setLoading(false);
          },
        });
        if (cancelled) return;
        await persistDevice(storage, device, session.userId);
        for (const m of synced) messageIds.current.add(m.id);
        setMessages(synced);
        setMessageCursor(cursor);
        setHasMore(Boolean(more));
        const last = synced[synced.length - 1];
        if (last) markConversationRead(peerId, last.time);
      } catch (e) {
        if (!cancelled) Alert.alert("Error", friendlyError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, device, peerId, markConversationRead]);

  async function loadOlder() {
    if (!session || !device || !peerId || !messageCursor || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const { messages: envelopes, cursor, hasMore: more } = await fetchConversation(
        session.token,
        peerId,
        { cursor: messageCursor, limit: 50 }
      );
      const older: DisplayMessage[] = [];
      for (const envelope of envelopes) {
        if (messageIds.current.has(envelope.id)) continue;
        const display = await decryptEnvelope(
          device,
          envelope,
          session.userId,
          historyDecryptOptions(storage, session.userId, envelope, session.userId, session.deviceId)
        );
        messageIds.current.add(display.id);
        older.push(display);
      }
      setMessages((prev) => {
        const merged = sortMessages(dedupeMessages([...older, ...prev]));
        void mergeConversationTimeline(storage, session.userId, peerId, older);
        return merged;
      });
      setMessageCursor(cursor);
      setHasMore(Boolean(more));
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function showSafetyNumbers() {
    if (!session || !device || !peerId) return;
    try {
      const bundle = await fetchPreKeyBundle(peerId);
      const material = await device.exportKeyMaterial();
      const number = await generateSafetyNumber(
        session.userId,
        material.identityKeyPublic,
        peerId,
        bundle.identityKey
      );
      setSafetyNumber(number);
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    }
  }

  async function handleSend() {
    if (!session || !device || !peerId || !draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);

    const optimisticId = `opt-${Date.now()}`;
    const optimistic: DisplayMessage = {
      id: optimisticId,
      from: "me",
      content: { type: "text", text },
      time: new Date().toISOString(),
      date: "Today",
      status: "sent",
    };
    // UI-only — do not seal optimistic ids into the vault/timeline.
    messageIds.current.add(optimisticId);
    setMessages((prev) => sortMessages(dedupeMessages([...prev, optimistic])));

    try {
      ensureMobileCrypto();
      const [peerDeviceIds, ownOtherDeviceIds] = await Promise.all([
        listRecipientDeviceIds(peerId),
        listOwnOtherDeviceIds(session.token, session.deviceId),
      ]);
      const { recipientPayload, recipientCiphertexts, senderCiphertexts } =
        await encryptOutgoingMessage(
        device,
        session.userId,
        peerId,
        { type: "text", text },
        peerDeviceIds,
        ownOtherDeviceIds
      );
      const result = await sendEncryptedMessage(
        session.token,
        peerId,
        recipientPayload,
        "text",
        undefined,
        peerDeviceIds[0] ?? 1,
        senderCiphertexts,
        recipientCiphertexts
      );
      await persistDevice(storage, device, session.userId);

      messageIds.current.delete(optimisticId);
      messageIds.current.add(result.messageId);
      const sentMessage: DisplayMessage = {
        id: result.messageId,
        from: "me",
        content: { type: "text", text },
        time: result.createdAt,
        date: formatMessageDate(result.createdAt),
        status: "sent",
      };
      setMessages((prev) =>
        sortMessages(
          dedupeMessages(
            prev.map((m) => (m.id === optimisticId ? sentMessage : m))
          )
        )
      );
      await persistOwnDirectMessage(storage, session.userId, peerId, sentMessage, {
        replaceOptimisticId: optimisticId,
      });
      if (device) {
        scheduleAccountBackupRefresh(storage, session.token, device, session.userId);
      }
      void refreshConversations();
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, status: "failed" } : m))
      );
      Alert.alert("Send failed", friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  async function handleAttachMedia() {
    if (!session || !device || !peerId || sending) return;
    setSending(true);
    try {
      const prepared = await pickAndPrepareMedia(session.token);
      if (!prepared) return;

      const [peerDeviceIds, ownOtherDeviceIds] = await Promise.all([
        listRecipientDeviceIds(peerId),
        listOwnOtherDeviceIds(session.token, session.deviceId),
      ]);
      const { recipientPayload, recipientCiphertexts, senderCiphertexts } =
        await encryptOutgoingMessage(
        device,
        session.userId,
        peerId,
        prepared.content,
        peerDeviceIds,
        ownOtherDeviceIds
      );
      const result = await sendEncryptedMessage(
        session.token,
        peerId,
        recipientPayload,
        prepared.messageType,
        undefined,
        peerDeviceIds[0] ?? 1,
        senderCiphertexts,
        recipientCiphertexts
      );
      await persistDevice(storage, device, session.userId);

      const sentMessage: DisplayMessage = {
        id: result.messageId,
        from: "me",
        content: prepared.content,
        time: result.createdAt,
        date: formatMessageDate(result.createdAt),
        status: "sent",
      };
      addMessage(sentMessage);
      await persistOwnDirectMessage(storage, session.userId, peerId, sentMessage);
      scheduleAccountBackupRefresh(storage, session.token, device, session.userId);
      void refreshConversations();
    } catch (e) {
      Alert.alert("Send failed", friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  function renderBubble({ item }: { item: DisplayMessage }) {
    const isOut = item.from === "me";
    const failed = item.status === "failed" || item.status === "decrypt_failed";

    return (
      <View style={[styles.bubbleRow, isOut ? styles.bubbleRowOut : styles.bubbleRowIn]}>
        <View
          style={[
            styles.bubble,
            isOut ? styles.bubbleOut : styles.bubbleIn,
            failed && styles.bubbleFailed,
          ]}
        >
          {item.status === "decrypt_failed" ? (
            <Text style={styles.bubbleText}>
              {item.content.text ||
                (item.from === "me" ? OWN_UNAVAILABLE_TEXT : PEER_UNAVAILABLE_TEXT)}
            </Text>
          ) : (
            <>
              {item.content.type === "image" && item.content.image && (
                <Image
                  source={{
                    uri: `data:${item.content.image.mime};base64,${item.content.image.data}`,
                  }}
                  style={styles.bubbleImage}
                />
              )}
              {item.content.type === "media" && item.content.media && session && (
                <MediaBubble token={session.token} media={item.content.media} />
              )}
              {item.content.text && (
                <MarkdownText text={item.content.text} style={styles.bubbleText} />
              )}
            </>
          )}
          <Text style={styles.bubbleMeta}>
            🔒 {new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  return (
    <>
      <ChatScreenLayout
        list={
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderBubble}
            style={styles.list}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="interactive"
            ListHeaderComponent={
              hasMore ? (
                <TouchableOpacity style={styles.loadOlder} onPress={() => void loadOlder()} disabled={loadingOlder}>
                  <Text style={styles.loadOlderText}>
                    {loadingOlder ? "Loading…" : "Load older messages"}
                  </Text>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  🔒 Messages are end-to-end encrypted. No one outside this chat can read them.
                </Text>
              </View>
            }
          />
        }
        composer={
          <ChatComposer
            value={draft}
            onChangeText={setDraft}
            onSend={() => void handleSend()}
            onAttach={() => void handleAttachMedia()}
            sending={sending}
            attachDisabled={sending}
          />
        }
      />

      <Modal visible={!!safetyNumber} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Verify encryption</Text>
            <Text style={styles.modalText}>
              Compare this number with @{peerUsername} in person or over a trusted channel.
            </Text>
            <Text style={styles.safetyNumber} selectable>
              {safetyNumber}
            </Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setSafetyNumber(null)}>
              <Text style={styles.modalBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: theme.bgApp },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bgApp },
  messageList: { padding: 12, flexGrow: 1 },
  loadOlder: { alignItems: "center", paddingVertical: 12 },
  loadOlderText: { color: theme.accent, fontSize: 13 },
  bubbleRow: { marginVertical: 2 },
  bubbleRowOut: { alignItems: "flex-end" },
  bubbleRowIn: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
  },
  bubbleOut: { backgroundColor: theme.bgBubbleOut, borderBottomRightRadius: 4 },
  bubbleIn: { backgroundColor: theme.bgBubbleIn, borderBottomLeftRadius: 4 },
  bubbleFailed: { borderWidth: 1, borderColor: theme.danger },
  bubbleText: { color: theme.textPrimary, fontSize: 15, lineHeight: 20 },
  bubbleImage: { width: 200, height: 200, borderRadius: 6, marginBottom: 4 },
  bubbleMeta: { color: "rgba(255,255,255,0.5)", fontSize: 11, textAlign: "right", marginTop: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { color: theme.textSecondary, textAlign: "center", lineHeight: 22 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: theme.bgHeader,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  modalTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: "500", marginBottom: 8 },
  modalText: { color: theme.textSecondary, lineHeight: 20, marginBottom: 16 },
  safetyNumber: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    color: theme.textPrimary,
    backgroundColor: theme.bgInput,
    padding: 12,
    borderRadius: 8,
    lineHeight: 20,
  },
  modalBtn: {
    backgroundColor: theme.accent,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  modalBtnText: { color: theme.bgApp, fontWeight: "600" },
});
