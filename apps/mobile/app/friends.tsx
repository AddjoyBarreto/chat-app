import { searchUsers, presenceLabel } from "@vaultchat/client";
import type { UserSearchResult } from "@vaultchat/protocol";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { PresenceBadge } from "@/components/PresenceBadge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useApp } from "@/context/AppContext";
import { useFriendsContext } from "@/context/FriendsContext";
import { theme } from "@/theme";

export default function FriendsScreen() {
  const { session } = useApp();
  const friends = useFriendsContext();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) return;
    const q = username.trim().toLowerCase();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      void searchUsers(session.token, q, 8)
        .then((res) => setSearchResults(res.users))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [session, username]);

  if (!session) return null;

  const listData = [
    ...friends.incoming.map((r) => ({ type: "request" as const, item: r })),
    ...friends.friends.map((f) => ({ type: "friend" as const, item: f })),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.searchSection}>
        <TextInput
          style={styles.search}
          placeholder="Search by username…"
          placeholderTextColor={theme.textMuted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        {username.trim().length > 0 && username.trim().length < 2 && (
          <Text style={styles.hint}>Type at least 2 characters</Text>
        )}
        {searching && <ActivityIndicator color={theme.accent} style={styles.spinner} />}
        {!searching && username.trim().length >= 2 && searchResults.length === 0 && (
          <Text style={styles.hint}>No users found</Text>
        )}
        {searchResults.length > 0 && (
          <View style={styles.searchList}>
            {searchResults.map((user) => (
              <Pressable
                key={user.id}
                style={({ pressed }) => [styles.searchRow, pressed && styles.rowPressed]}
                disabled={user.relationship !== "none"}
                onPress={() =>
                  void friends
                    .addFriend(user.username)
                    .then(() => {
                      setUsername("");
                      setSearchResults([]);
                    })
                    .catch((e) => alert(String(e)))
                }
              >
                <Avatar name={user.username} size={40} />
                <Text style={styles.name}>@{user.username}</Text>
                <Text
                  style={[
                    styles.badge,
                    user.relationship === "friend" && styles.badgeMuted,
                    (user.relationship === "pending_out" || user.relationship === "pending_in") &&
                      styles.badgeMuted,
                  ]}
                >
                  {user.relationship === "none"
                    ? "Add"
                    : user.relationship === "friend"
                      ? "Friends"
                      : "Pending"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {friends.loading ? (
        <ActivityIndicator color={theme.accent} style={styles.listSpinner} />
      ) : listData.length === 0 ? (
        <EmptyState
          icon="👋"
          title="No friends yet"
          description="Search for someone by username to send a friend request."
        />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(row) =>
            row.type === "request" ? `req-${row.item.id}` : `friend-${row.item.userId}`
          }
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            friends.incoming.length > 0 ? (
              <Text style={styles.sectionLabel}>Friend requests</Text>
            ) : null
          }
          renderItem={({ item: row }) =>
            row.type === "request" ? (
              <Card style={styles.card}>
                <View style={styles.cardRow}>
                  <Avatar name={row.item.senderUsername} size={40} />
                  <Text style={styles.name}>@{row.item.senderUsername}</Text>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    style={styles.acceptBtn}
                    onPress={() => void friends.accept(row.item.id)}
                  >
                    <Text style={styles.acceptText}>Accept</Text>
                  </Pressable>
                  <Pressable onPress={() => void friends.reject(row.item.id)}>
                    <Text style={styles.declineText}>Decline</Text>
                  </Pressable>
                </View>
              </Card>
            ) : (
              <Card
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: "/conversation/[peerId]",
                    params: { peerId: row.item.userId, peerUsername: row.item.username },
                  })
                }
              >
                <View style={styles.cardRow}>
                  <View>
                    <Avatar name={row.item.username} size={40} />
                    <PresenceBadge
                      status={friends.getPresence(row.item.userId)}
                      style={styles.friendPresence}
                    />
                  </View>
                  <View style={styles.friendInfo}>
                    <Text style={styles.name}>@{row.item.username}</Text>
                    <Text style={styles.presence}>
                      {presenceLabel(friends.getPresence(row.item.userId))}
                    </Text>
                  </View>
                </View>
              </Card>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgApp },
  searchSection: {
    padding: theme.spacing.lg,
    backgroundColor: theme.bgHeader,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  search: {
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 12,
    fontSize: theme.fontSize.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  hint: { color: theme.textMuted, fontSize: theme.fontSize.sm, marginTop: theme.spacing.sm },
  spinner: { marginTop: theme.spacing.sm },
  searchList: { marginTop: theme.spacing.md, gap: theme.spacing.sm },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.bgElevated,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  rowPressed: { opacity: 0.85 },
  badge: {
    marginLeft: "auto",
    color: theme.accent,
    fontWeight: "600",
    fontSize: theme.fontSize.sm,
  },
  badgeMuted: { color: theme.textMuted, fontWeight: "500" },
  list: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  listSpinner: { marginTop: theme.spacing.xxl },
  sectionLabel: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: theme.spacing.sm,
  },
  card: { marginBottom: theme.spacing.sm },
  cardRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  friendInfo: { flex: 1 },
  friendPresence: { position: "absolute", right: -1, bottom: -1 },
  presence: { color: theme.textMuted, fontSize: theme.fontSize.sm, marginTop: 2 },
  name: { color: theme.textPrimary, fontSize: theme.fontSize.lg, fontWeight: "500" },
  actions: { flexDirection: "row", gap: theme.spacing.lg, marginTop: theme.spacing.md },
  acceptBtn: {
    backgroundColor: theme.accent,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
  },
  acceptText: { color: theme.bgApp, fontWeight: "600" },
  declineText: { color: theme.textMuted, paddingVertical: theme.spacing.sm },
});
