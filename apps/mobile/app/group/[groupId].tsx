import {
  decryptGroupEnvelope,
  fetchGroupMembers,
  fetchGroupMessages,
  friendlyError,
  loadGroupCipher,
  previewGroupContent,
  reshareGroupKey,
  sendGroupContentMessage,
} from "@vaultchat/client";
import type { MessageContent, WsServerEvent } from "@vaultchat/protocol";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MediaBubble } from "@/components/MediaBubble";
import { useApp, storage } from "@/context/AppContext";
import { pickAndPrepareMedia } from "@/lib/media";
import { theme } from "@/theme";

interface GroupMsg {
  id: string;
  text: string;
  content: MessageContent;
  from: "me" | "them";
  time: string;
  failed?: boolean;
}

export default function GroupChatScreen() {
  const { groupId, groupName } = useLocalSearchParams<{
    groupId: string;
    groupName: string;
  }>();
  const { session, device, onServerEventHandlers, groupKeysVersion } = useApp();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<GroupMsg[]>([]);
  const messageIds = useRef(new Set<string>());
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [resharing, setResharing] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: groupName ?? "Group",
      headerRight: () =>
        isAdmin && hasKey ? (
          <TouchableOpacity
            onPress={() => void handleReshareKey()}
            disabled={resharing}
            style={{ marginRight: 12, opacity: resharing ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: 20 }}>🔑</Text>
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, groupName, isAdmin, hasKey, resharing]);

  const loadMessages = useCallback(async () => {
    if (!session || !groupId) return;
    const members = await fetchGroupMembers(session.token, groupId);
    const me = members.find((m) => m.userId === session.userId);
    setIsAdmin(me?.role === "admin");
    const cipher = await loadGroupCipher(storage, session.userId, groupId);
    setHasKey(cipher !== null);

    const { messages: envelopes } = await fetchGroupMessages(session.token, groupId);
    const parsed: GroupMsg[] = [];
    for (const e of envelopes) {
      const msg = await decryptGroupEnvelope(storage, groupId, e, session.userId);
      parsed.push({
        id: msg.id,
        text: msg.text,
        content: msg.content,
        from: msg.from,
        time: msg.time,
        failed: msg.failed,
      });
    }
    messageIds.current.clear();
    for (const m of parsed) messageIds.current.add(m.id);
    setMessages(parsed);
  }, [session, groupId]);

  useEffect(() => {
    void (async () => {
      try {
        await loadMessages();
      } catch (e) {
        Alert.alert("Error", friendlyError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMessages]);

  useEffect(() => {
    if (!loading && groupKeysVersion > 0) {
      void loadMessages();
    }
  }, [groupKeysVersion, loading, loadMessages]);

  const handleGroupEvent = useCallback(
    (event: WsServerEvent) => {
      if (event.type !== "group_message" || !session || !groupId) return;
      if (event.envelope.groupId !== groupId) return;
      if (messageIds.current.has(event.envelope.id)) return;
      void decryptGroupEnvelope(storage, groupId, event.envelope, session.userId).then(
        (msg) => {
          messageIds.current.add(msg.id);
          setMessages((prev) => [
            ...prev,
            {
              id: msg.id,
              text: msg.text,
              content: msg.content,
              from: msg.from,
              time: msg.time,
              failed: msg.failed,
            },
          ]);
        }
      );
    },
    [session, groupId]
  );

  useEffect(() => {
    onServerEventHandlers.current.add(handleGroupEvent);
    return () => {
      onServerEventHandlers.current.delete(handleGroupEvent);
    };
  }, [handleGroupEvent, onServerEventHandlers]);

  async function handleReshareKey() {
    if (!session || !device || !groupId) return;
    setResharing(true);
    try {
      const { sharedWith } = await reshareGroupKey(
        storage,
        session.token,
        device,
        session.userId,
        groupId
      );
      Alert.alert("Key shared", `Encryption key sent to ${sharedWith} member(s) via encrypted DM`);
    } catch (e) {
      Alert.alert("Failed", friendlyError(e));
    } finally {
      setResharing(false);
    }
  }

  async function handleSend() {
    if (!session || !groupId || !draft.trim() || !hasKey) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);
    try {
      const result = await sendGroupContentMessage(
        storage,
        session.userId,
        session.token,
        groupId,
        { type: "text", text },
        "text"
      );
      setMessages((prev) => [
        ...prev,
        {
          id: result.messageId,
          text,
          content: { type: "text", text },
          from: "me",
          time: result.createdAt,
        },
      ]);
      messageIds.current.add(result.messageId);
    } catch (e) {
      Alert.alert("Send failed", friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  async function handleAttachMedia() {
    if (!session || !groupId || !hasKey || sending) return;
    setSending(true);
    try {
      const prepared = await pickAndPrepareMedia(session.token);
      if (!prepared) return;
      const result = await sendGroupContentMessage(
        storage,
        session.userId,
        session.token,
        groupId,
        prepared.content,
        prepared.messageType
      );
      setMessages((prev) => [
        ...prev,
        {
          id: result.messageId,
          text: previewGroupContent(prepared.content),
          content: prepared.content,
          from: "me",
          time: result.createdAt,
        },
      ]);
      messageIds.current.add(result.messageId);
    } catch (e) {
      Alert.alert("Send failed", friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  function renderBubble({ item }: { item: GroupMsg }) {
    return (
      <View style={[styles.bubble, item.from === "me" ? styles.bubbleOut : styles.bubbleIn]}>
        {item.failed ? (
          <Text style={styles.bubbleText}>{item.text}</Text>
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
            {item.content.text && item.content.type === "text" && (
              <Text style={styles.bubbleText}>{item.content.text}</Text>
            )}
          </>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {!hasKey && (
        <Text style={styles.banner}>
          Missing group key — ask the admin to tap 🔑 to re-share
        </Text>
      )}
      <Text style={styles.header}>🔒 {groupName}</Text>
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={renderBubble}
      />
      <View style={styles.composer}>
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={() => void handleAttachMedia()}
          disabled={sending || !hasKey}
        >
          <Text style={styles.attachBtnText}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={hasKey ? "Group message" : "Waiting for encryption key…"}
          placeholderTextColor={theme.textMuted}
          editable={hasKey && !sending}
        />
        <TouchableOpacity
          style={[styles.send, (!draft.trim() || sending || !hasKey) && styles.sendDisabled]}
          onPress={() => void handleSend()}
          disabled={!draft.trim() || sending || !hasKey}
        >
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgApp },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bgApp },
  banner: {
    backgroundColor: theme.bgHeader,
    color: theme.warning,
    padding: 10,
    fontSize: 13,
    textAlign: "center",
  },
  header: { padding: 12, backgroundColor: theme.bgHeader, color: theme.textSecondary, fontSize: 13 },
  bubble: { maxWidth: "80%", padding: 10, borderRadius: 8, marginVertical: 4 },
  bubbleOut: { alignSelf: "flex-end", backgroundColor: theme.bgBubbleOut },
  bubbleIn: { alignSelf: "flex-start", backgroundColor: theme.bgBubbleIn },
  bubbleText: { color: theme.textPrimary },
  bubbleImage: { width: 200, height: 200, borderRadius: 6, marginBottom: 4 },
  composer: { flexDirection: "row", padding: 8, gap: 8, backgroundColor: theme.bgHeader, alignItems: "flex-end" },
  attachBtn: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  attachBtnText: { fontSize: 20 },
  input: {
    flex: 1,
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: theme.bgApp, fontSize: 18 },
});
