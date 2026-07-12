import {
  decryptChannelEnvelope,
  decryptGroupEnvelope,
  fetchChannelCategories,
  fetchCommunityChannels,
  fetchGroupMembers,
  fetchGroups,
  fetchVoicePresence,
  friendlyError,
  joinVoiceChannel,
  leaveVoiceChannel,
  loadChannelHistory,
  loadGroupCipher,
  reshareGroupKey,
  sendChannelContentMessage,
  shareGroupKeyWithMember,
} from "@vaultchat/client";
import type {
  ChannelCategoryInfo,
  ChannelInfo,
  VoicePresenceInfo,
  WsServerEvent,
} from "@vaultchat/protocol";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GroupChannelDrawer } from "@/components/group/GroupChannelDrawer";
import { GroupMembersSheet } from "@/components/group/GroupMembersSheet";
import { GroupMessageList, type GroupMessageItem } from "@/components/group/GroupMessageList";
import { GroupVoiceView } from "@/components/group/GroupVoiceView";
import {
  ChannelTypeIcon,
  IconAccountGroup,
  IconChevronDown,
  IconChevronLeft,
} from "@/components/icons/CommunityIcons";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatScreenLayout } from "@/components/ChatScreenLayout";
import { useApp, storage } from "@/context/AppContext";
import { useFriendsContext } from "@/context/FriendsContext";
import { pickAndPrepareMedia } from "@/lib/media";
import { theme } from "@/theme";

export default function GroupChatScreen() {
  const { groupId, groupName } = useLocalSearchParams<{
    groupId: string;
    groupName: string;
  }>();
  const { session, device, onServerEventHandlers, groupKeysVersion } = useApp();
  const friends = useFriendsContext();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(groupName ?? "Community");
  const [categories, setCategories] = useState<ChannelCategoryInfo[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChannelInfo | null>(null);
  const [members, setMembers] = useState<Awaited<ReturnType<typeof fetchGroupMembers>>>([]);
  const [messages, setMessages] = useState<GroupMessageItem[]>([]);
  const messageIds = useRef(new Set<string>());
  const activeChannelRef = useRef<ChannelInfo | null>(null);
  activeChannelRef.current = activeChannel;
  const [messageCursor, setMessageCursor] = useState<string | undefined>();
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [legacyHistory, setLegacyHistory] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [resharing, setResharing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState<VoicePresenceInfo[]>([]);
  const [inVoice, setInVoice] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);

  const me = members.find((m) => m.userId === session?.userId);

  const refreshChannels = useCallback(async () => {
    if (!session || !groupId) return [];
    const [ch, cats] = await Promise.all([
      fetchCommunityChannels(session.token, groupId),
      fetchChannelCategories(session.token, groupId),
    ]);
    setChannels(ch.channels);
    setCategories(cats.categories);
    return ch.channels;
  }, [session, groupId]);

  const loadMessages = useCallback(async () => {
    if (!session || !groupId || !activeChannelRef.current) return;
    const channelId = activeChannelRef.current.id;
    const page = await loadChannelHistory(
      storage,
      session.token,
      groupId,
      channelId,
      session.userId
    );
    const names = new Map(members.map((m) => [m.userId, m.username]));
    const myName = members.find((m) => m.userId === session.userId)?.username ?? session.username;
    const parsed: GroupMessageItem[] = page.messages.map((msg) => ({
      id: msg.id,
      username:
        msg.from === "me"
          ? myName
          : (msg.senderId && names.get(msg.senderId)) || msg.senderId?.slice(0, 8) || "Member",
      text: msg.text,
      content: msg.content,
      from: msg.from,
      time: msg.time,
      failed: msg.failed,
    }));
    messageIds.current.clear();
    for (const m of parsed) messageIds.current.add(m.id);
    setMessages(parsed);
    setMessageCursor(page.cursor);
    setHasMoreMessages(page.hasMore);
    setLegacyHistory(Boolean(page.legacy));
  }, [session, groupId, members]);

  const loadOlderMessages = useCallback(async () => {
    if (!session || !groupId || !activeChannelRef.current) return;
    if (!messageCursor || loadingOlder || !hasMoreMessages) return;
    setLoadingOlder(true);
    try {
      const page = await loadChannelHistory(
        storage,
        session.token,
        groupId,
        activeChannelRef.current.id,
        session.userId,
        { cursor: messageCursor, legacy: legacyHistory }
      );
      const names = new Map(members.map((m) => [m.userId, m.username]));
      const myName = members.find((m) => m.userId === session.userId)?.username ?? session.username;
      const older: GroupMessageItem[] = [];
      for (const msg of page.messages) {
        if (messageIds.current.has(msg.id)) continue;
        messageIds.current.add(msg.id);
        older.push({
          id: msg.id,
          username:
            msg.from === "me"
              ? myName
              : (msg.senderId && names.get(msg.senderId)) ||
                msg.senderId?.slice(0, 8) ||
                "Member",
          text: msg.text,
          content: msg.content,
          from: msg.from,
          time: msg.time,
          failed: msg.failed,
        });
      }
      setMessages((prev) => [...older, ...prev]);
      setMessageCursor(page.cursor);
      setHasMoreMessages(page.hasMore);
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setLoadingOlder(false);
    }
  }, [session, groupId, members, messageCursor, loadingOlder, hasMoreMessages, legacyHistory]);

  const refreshVoice = useCallback(
    async (channelId: string) => {
      if (!session) return;
      const res = await fetchVoicePresence(session.token, channelId);
      setVoiceMembers(res.members);
    },
    [session]
  );

  useEffect(() => {
    if (!session || !groupId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [memberList, ch, groupList] = await Promise.all([
          fetchGroupMembers(session.token, groupId),
          refreshChannels(),
          fetchGroups(session.token),
        ]);
        if (cancelled) return;
        setMembers(memberList);
        setCreatedBy(groupList.find((g) => g.id === groupId)?.createdBy ?? null);
        const admin = memberList.find((m) => m.userId === session.userId);
        setIsAdmin(admin?.role === "admin");
        const cipher = await loadGroupCipher(storage, session.userId, groupId);
        setHasKey(cipher !== null);
        const general =
          ch.find((c) => c.type === "text" && c.name === "general") ??
          ch.find((c) => c.type === "text") ??
          null;
        setActiveChannel(general);
        if (groupName) setDisplayName(groupName);
      } catch (e) {
        if (!cancelled) Alert.alert("Error", friendlyError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, groupId, groupName, refreshChannels]);

  useEffect(() => {
    if (!activeChannel || activeChannel.type !== "text" || !hasKey) return;
    void loadMessages().catch((e) => Alert.alert("Error", friendlyError(e)));
  }, [activeChannel, hasKey, loadMessages, groupKeysVersion]);

  useEffect(() => {
    if (!activeChannel || activeChannel.type !== "voice") return;
    void refreshVoice(activeChannel.id).catch(() => {});
  }, [activeChannel, refreshVoice]);

  const handleGroupEvent = useCallback(
    (event: WsServerEvent) => {
      if (!session || !groupId) return;
      if (
        event.type === "channel_message" &&
        activeChannelRef.current?.id === event.envelope.channelId
      ) {
        if (messageIds.current.has(event.envelope.id)) return;
        messageIds.current.add(event.envelope.id);
        void decryptChannelEnvelope(storage, groupId, event.envelope, session.userId).then(
          (msg) => {
            const author =
              msg.from === "me"
                ? (me?.username ?? session.username)
                : (members.find((m) => m.userId === event.envelope.senderId)?.username ??
                  event.envelope.senderId.slice(0, 8));
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [
                ...prev,
                {
                  id: msg.id,
                  username: author,
                  text: msg.text,
                  content: msg.content,
                  from: msg.from,
                  time: msg.time,
                  failed: msg.failed,
                },
              ];
            });
          }
        );
        return;
      }
      if (
        event.type === "group_message" &&
        event.envelope.groupId === groupId &&
        activeChannelRef.current?.name === "general"
      ) {
        if (messageIds.current.has(event.envelope.id)) return;
        messageIds.current.add(event.envelope.id);
        void decryptGroupEnvelope(storage, groupId, event.envelope, session.userId).then(
          (msg) => {
            const author =
              msg.from === "me"
                ? (me?.username ?? session.username)
                : (members.find((m) => m.userId === event.envelope.senderId)?.username ??
                  event.envelope.senderId.slice(0, 8));
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [
                ...prev,
                {
                  id: msg.id,
                  username: author,
                  text: msg.text,
                  content: msg.content,
                  from: msg.from,
                  time: msg.time,
                  failed: msg.failed,
                },
              ];
            });
          }
        );
      }
      if (
        event.type === "voice_presence" &&
        activeChannel?.type === "voice" &&
        event.channelId === activeChannel.id
      ) {
        setVoiceMembers(event.members);
      }
    },
    [session, groupId, me?.username, members, activeChannel]
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
      Alert.alert("Key shared", `Encryption key sent to ${sharedWith} member(s)`);
      setHasKey(true);
    } catch (e) {
      Alert.alert("Failed", friendlyError(e));
    } finally {
      setResharing(false);
    }
  }

  async function handleShareKeyWithMember(targetUserId: string) {
    if (!session || !device || !groupId) return;
    await shareGroupKeyWithMember(
      storage,
      session.token,
      device,
      session.userId,
      groupId,
      targetUserId
    );
  }

  async function refreshMembers() {
    if (!session || !groupId) return;
    setMembers(await fetchGroupMembers(session.token, groupId));
  }

  async function handleSend() {
    if (!session || !groupId || !draft.trim() || !hasKey || !activeChannel) return;
    if (activeChannel.type !== "text") return;
    const text = draft.trim();
    const channelId = activeChannel.id;
    setDraft("");
    setSending(true);
    const optimisticId = `${Date.now()}-local`;
    messageIds.current.add(optimisticId);
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        username: me?.username ?? session.username,
        text,
        content: { type: "text", text },
        from: "me",
        time: new Date().toISOString(),
      },
    ]);
    try {
      const result = await sendChannelContentMessage(
        storage,
        session.userId,
        session.token,
        groupId,
        channelId,
        { type: "text", text },
        "text"
      );
      messageIds.current.delete(optimisticId);
      messageIds.current.add(result.messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, id: result.messageId, time: result.createdAt } : m
        )
      );
    } catch (e) {
      messageIds.current.delete(optimisticId);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(text);
      Alert.alert("Send failed", friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  async function handleAttachMedia() {
    if (!session || !groupId || !hasKey || sending || !activeChannel) return;
    if (activeChannel.type !== "text") return;
    setSending(true);
    try {
      const prepared = await pickAndPrepareMedia(session.token);
      if (!prepared) return;
      const result = await sendChannelContentMessage(
        storage,
        session.userId,
        session.token,
        groupId,
        activeChannel.id,
        prepared.content,
        prepared.messageType
      );
      messageIds.current.add(result.messageId);
      await loadMessages();
    } catch (e) {
      Alert.alert("Send failed", friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  async function toggleVoice() {
    if (!session || !activeChannel || activeChannel.type !== "voice") return;
    setVoiceLoading(true);
    try {
      if (inVoice) {
        await leaveVoiceChannel(session.token, activeChannel.id);
        setInVoice(false);
      } else {
        await joinVoiceChannel(session.token, activeChannel.id);
        setInVoice(true);
      }
      await refreshVoice(activeChannel.id);
    } catch (e) {
      Alert.alert("Voice", friendlyError(e));
    } finally {
      setVoiceLoading(false);
    }
  }

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/groups");
    }
  }

  function selectChannel(channel: ChannelInfo) {
    setActiveChannel(channel);
    if (channel.type === "voice") setInVoice(false);
  }

  const channelType = activeChannel?.type ?? "text";

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={goBack} hitSlop={8} accessibilityLabel="Back to communities">
          <IconChevronLeft size={26} />
        </Pressable>
        <Pressable style={styles.headerCenter} onPress={() => setDrawerOpen(true)}>
          <View style={styles.channelPrefix}>
            <ChannelTypeIcon type={channelType} size={20} color={theme.textMuted} />
          </View>
          <Text style={styles.channelTitle} numberOfLines={1}>
            {activeChannel?.name ?? "Select a channel"}
          </Text>
          <IconChevronDown size={14} color={theme.textMuted} />
        </Pressable>
        <Pressable style={styles.headerBtn} onPress={() => setMembersOpen(true)} hitSlop={8}>
          <IconAccountGroup size={22} />
        </Pressable>
      </View>

      {!hasKey && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Missing encryption key — ask an admin to re-share the key
          </Text>
          {isAdmin ? (
            <Pressable
              style={styles.bannerBtn}
              onPress={() => void handleReshareKey()}
              disabled={resharing}
            >
              <Text style={styles.bannerBtnText}>{resharing ? "Sharing…" : "Re-share key"}</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {activeChannel?.type === "text" ? (
        <ChatScreenLayout
          list={
            <GroupMessageList
              messages={messages}
              channelName={activeChannel.name}
              token={session!.token}
              hasKey={hasKey}
              hasMore={hasMoreMessages}
              loadingOlder={loadingOlder}
              onLoadOlder={() => void loadOlderMessages()}
            />
          }
          composer={
            <ChatComposer
              value={draft}
              onChangeText={setDraft}
              onSend={() => void handleSend()}
              onAttach={() => void handleAttachMedia()}
              placeholder={hasKey ? `Message #${activeChannel.name}` : "Waiting for encryption key…"}
              editable={hasKey}
              sending={sending}
              attachDisabled={!hasKey}
              sendDisabled={!hasKey || !draft.trim()}
            />
          }
        />
      ) : activeChannel?.type === "voice" ? (
        <GroupVoiceView
          channelName={activeChannel.name}
          members={voiceMembers}
          inVoice={inVoice}
          loading={voiceLoading}
          onToggleVoice={() => void toggleVoice()}
        />
      ) : (
        <View style={styles.emptyChannel}>
          <Text style={styles.emptyChannelText}>Select a channel from the menu</Text>
          <Pressable style={styles.emptyChannelBtn} onPress={() => setDrawerOpen(true)}>
            <Text style={styles.emptyChannelBtnText}>Browse channels</Text>
          </Pressable>
        </View>
      )}

      <GroupChannelDrawer
        visible={drawerOpen}
        communityName={displayName}
        categories={categories}
        channels={channels}
        activeChannelId={activeChannel?.id}
        onClose={() => setDrawerOpen(false)}
        onBack={goBack}
        onSelectChannel={selectChannel}
      />

      <GroupMembersSheet
        visible={membersOpen}
        communityId={groupId!}
        communityName={displayName}
        members={members}
        isAdmin={isAdmin}
        isOwner={createdBy !== null && createdBy === session?.userId}
        createdBy={createdBy}
        getPresence={friends.getPresence}
        onClose={() => setMembersOpen(false)}
        onMembersChanged={() => void refreshMembers()}
        onShareKey={isAdmin ? handleShareKeyWithMember : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bgHeader },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bgApp },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.bgHeader,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: { color: theme.textPrimary, fontSize: 22 },
  backIcon: { color: theme.textPrimary, fontSize: 32, fontWeight: "300", marginTop: -4 },
  membersIcon: { fontSize: 20 },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.spacing.xs,
  },
  channelPrefix: { width: 22, alignItems: "center" },
  channelTitle: { color: theme.textPrimary, fontSize: theme.fontSize.lg, fontWeight: "600", flex: 1 },
  channelChevron: { color: theme.textMuted, fontSize: 14, marginLeft: 2 },
  banner: {
    backgroundColor: theme.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  bannerText: {
    color: theme.warning,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    lineHeight: 18,
  },
  bannerBtn: {
    alignSelf: "center",
    backgroundColor: theme.accent,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
  },
  bannerBtnText: { color: theme.bgApp, fontWeight: "600", fontSize: theme.fontSize.sm },
  emptyChannel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgApp,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  emptyChannelText: { color: theme.textSecondary, fontSize: theme.fontSize.md },
  emptyChannelBtn: {
    backgroundColor: theme.accent,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.pill,
  },
  emptyChannelBtnText: { color: theme.bgApp, fontWeight: "600" },
});
