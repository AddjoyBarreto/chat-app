import { friendlyError, lookupUser, validateUsername } from "@vaultchat/client";
import { formatMessageTime } from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "@/context/AppContext";
import { theme } from "@/theme";

export default function ChatsScreen() {
  const { session, conversations, connectionState, logout } = useApp();
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

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <Text
          style={[
            styles.statusText,
            { flex: 1 },
            connectionState === "connected" && styles.statusOnline,
          ]}
        >
          {connectionState === "connected"
            ? "● Online"
            : connectionState === "reconnecting"
              ? "↻ Reconnecting…"
              : "○ Offline"}
        </Text>
        <TouchableOpacity onPress={() => router.push("/friends")}>
          <Text style={styles.groupsLink}>Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/groups")}>
          <Text style={styles.groupsLink}>Communities</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void logout()}>
          <Text style={styles.logout}>Log out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
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
          <TouchableOpacity style={styles.goBtn} onPress={() => void startNewChat()} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color={theme.bgApp} />
            ) : (
              <Text style={styles.goBtnText}>Go</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptyText}>Search for a username to start an encrypted chat.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.peerId}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.chatItem}
              onPress={() =>
                router.push({
                  pathname: "/conversation/[peerId]",
                  params: { peerId: item.peerId, peerUsername: item.peerUsername },
                })
              }
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.peerUsername[0]?.toUpperCase()}</Text>
              </View>
              <View style={styles.chatBody}>
                <Text style={styles.chatName}>@{item.peerUsername}</Text>
                <Text style={styles.chatPreview}>🔒 Encrypted message</Text>
              </View>
              <Text style={styles.chatTime}>{formatMessageTime(item.lastMessageAt)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgPanel },
  statusBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.bgHeader,
  },
  statusText: { color: theme.textSecondary, fontSize: 13 },
  statusOnline: { color: theme.online },
  groupsLink: { color: theme.accent, fontSize: 13 },
  logout: { color: theme.textSecondary, fontSize: 13 },
  searchWrap: {
    flexDirection: "row",
    padding: 10,
    gap: 8,
    backgroundColor: theme.bgHeader,
  },
  search: {
    flex: 1,
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    padding: 10,
    borderRadius: 8,
    fontSize: 15,
  },
  goBtn: {
    backgroundColor: theme.accent,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: "center",
  },
  goBtnText: { color: theme.bgApp, fontWeight: "600" },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#6b7c85",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: theme.textPrimary, fontSize: 18, fontWeight: "600" },
  chatBody: { flex: 1 },
  chatName: { color: theme.textPrimary, fontSize: 16, fontWeight: "500" },
  chatPreview: { color: theme.textSecondary, fontSize: 14, marginTop: 2 },
  chatTime: { color: theme.textMuted, fontSize: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12, opacity: 0.5 },
  emptyTitle: { color: theme.textPrimary, fontSize: 18, marginBottom: 8 },
  emptyText: { color: theme.textSecondary, textAlign: "center", lineHeight: 22 },
});
