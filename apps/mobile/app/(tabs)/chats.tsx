import { friendlyError, lookupUser, validateUsername } from "@vaultchat/client";
import { formatMessageTime } from "@vaultchat/client";
import { presenceLabel } from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { PresenceBadge } from "@/components/PresenceBadge";
import { PresenceStatusPicker } from "@/components/PresenceStatusPicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/context/AppContext";
import { useFriendsContext } from "@/context/FriendsContext";
import { theme } from "@/theme";

export default function ChatsScreen() {
  const { session, conversations, connectionState, unreadByPeer, previews } = useApp();
  const friends = useFriendsContext();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  if (!session) return <Redirect href="/register" />;

  const filtered = conversations.filter((c) =>
    c.peerUsername.toLowerCase().includes(search.toLowerCase())
  );

  async function startNewChat() {
    const name = search.trim().toLowerCase();
    const validation = validateUsername(name);
    if (validation) {
      Alert.alert("Invalid username", validation);
      return;
    }
    if (name === session!.username) {
      Alert.alert("Error", "You can't message yourself.");
      return;
    }

    setLoading(true);
    try {
      const user = await lookupUser(name);
      setSearch("");
      router.push({
        pathname: "/conversation/[peerId]",
        params: { peerId: user.id, peerUsername: user.username },
      });
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  const statusLabel =
    connectionState === "connected"
      ? presenceLabel(friends.ownPresence)
      : connectionState === "reconnecting"
        ? "Reconnecting"
        : "Offline";

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Chats"
        subtitle="End-to-end encrypted"
        right={
          connectionState === "connected" ? (
            <PresenceStatusPicker
              value={friends.ownPresence}
              onChange={friends.setPresence}
            />
          ) : (
            <View style={[styles.statusPill, { borderColor: theme.textMuted }]}>
              <Text style={[styles.statusText, { color: theme.textMuted }]}>{statusLabel}</Text>
            </View>
          )
        }
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickLinks}
        style={styles.quickLinksBar}
      >
        <Pressable style={styles.quickLink} onPress={() => router.push("/friends")}>
          <Text style={styles.quickLinkText}>👥 Friends</Text>
        </Pressable>
        <Pressable style={styles.quickLink} onPress={() => router.push("/groups")}>
          <Text style={styles.quickLinkText}>🏘️ Communities</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.search}
          placeholder="Search or start new chat"
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => void startNewChat()}
          autoCapitalize="none"
          returnKeyType="go"
        />
        {search.trim().length > 0 && (
          <Pressable
            style={[styles.goBtn, loading && styles.goBtnDisabled]}
            onPress={() => void startNewChat()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={theme.bgApp} />
            ) : (
              <Text style={styles.goBtnText}>Go</Text>
            )}
          </Pressable>
        )}
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No conversations yet"
          description="Search for a username above to start an encrypted chat."
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.peerId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const unread = unreadByPeer[item.peerId] ?? 0;
            const preview = previews[item.peerId];
            return (
            <Pressable
              style={({ pressed }) => [
                styles.chatItem,
                unread > 0 && styles.chatItemUnread,
                pressed && styles.chatItemPressed,
              ]}
              onPress={() =>
                router.push({
                  pathname: "/conversation/[peerId]",
                  params: { peerId: item.peerId, peerUsername: item.peerUsername },
                })
              }
            >
              <View>
                <Avatar name={item.peerUsername} />
                <PresenceBadge
                  status={friends.getPresence(item.peerId)}
                  style={styles.chatPresence}
                />
              </View>
              <View style={styles.chatBody}>
                <Text style={[styles.chatName, unread > 0 && styles.chatNameUnread]}>
                  @{item.peerUsername}
                </Text>
                <Text
                  style={[styles.chatPreview, unread > 0 && styles.chatPreviewUnread]}
                  numberOfLines={1}
                >
                  {preview ?? `${presenceLabel(friends.getPresence(item.peerId))} · 🔒 Encrypted`}
                </Text>
              </View>
              {unread > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unread > 99 ? "99+" : unread}</Text>
                </View>
              ) : (
                <Text style={styles.chatTime}>{formatMessageTime(item.lastMessageAt)}</Text>
              )}
            </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgPanel },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    backgroundColor: theme.bgElevated,
  },
  statusText: { fontSize: theme.fontSize.sm, fontWeight: "600" },
  chatPresence: { position: "absolute", right: -1, bottom: -1 },
  quickLinksBar: {
    flexGrow: 0,
    backgroundColor: theme.bgHeader,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  quickLinks: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  quickLink: {
    backgroundColor: theme.bgElevated,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
  },
  quickLinkText: { color: theme.textPrimary, fontSize: theme.fontSize.sm, fontWeight: "500" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.bgApp,
  },
  searchIcon: { fontSize: 16, marginLeft: theme.spacing.xs },
  search: {
    flex: 1,
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    fontSize: theme.fontSize.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  goBtn: {
    backgroundColor: theme.accent,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    minWidth: 52,
    alignItems: "center",
  },
  goBtnDisabled: { opacity: 0.7 },
  goBtnText: { color: theme.bgApp, fontWeight: "600" },
  list: { paddingBottom: theme.spacing.lg },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  chatItemPressed: { backgroundColor: theme.bgElevated },
  chatItemUnread: { backgroundColor: theme.accentMuted },
  chatBody: { flex: 1 },
  chatName: { color: theme.textPrimary, fontSize: theme.fontSize.lg, fontWeight: "600" },
  chatNameUnread: { fontWeight: "700" },
  chatPreview: { color: theme.textSecondary, fontSize: theme.fontSize.md, marginTop: 2 },
  chatPreviewUnread: { color: theme.textPrimary, fontWeight: "500" },
  chatTime: { color: theme.textMuted, fontSize: theme.fontSize.sm },
  unreadBadge: {
    backgroundColor: theme.accent,
    minWidth: 22,
    height: 22,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: theme.bgApp,
    fontSize: theme.fontSize.xs,
    fontWeight: "700",
  },
});
