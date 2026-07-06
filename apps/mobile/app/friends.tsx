import {
  acceptFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  friendlyError,
  rejectFriendRequest,
  searchUsers,
  sendFriendRequest,
} from "@vaultchat/client";
import type { UserSearchResult } from "@vaultchat/protocol";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "@/context/AppContext";
import { theme } from "@/theme";

export default function FriendsScreen() {
  const { session } = useApp();
  const router = useRouter();
  const [friends, setFriends] = useState<Awaited<ReturnType<typeof fetchFriends>>["friends"]>([]);
  const [incoming, setIncoming] = useState<
    Awaited<ReturnType<typeof fetchFriendRequests>>["incoming"]
  >([]);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [f, r] = await Promise.all([
        fetchFriends(session.token),
        fetchFriendRequests(session.token),
      ]);
      setFriends(f.friends);
      setIncoming(r.incoming);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Friends</Text>

      <TextInput
        style={styles.inputFull}
        placeholder="Search by username…"
        placeholderTextColor={theme.textMuted}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      {username.trim().length > 0 && username.trim().length < 2 && (
        <Text style={styles.hint}>Type at least 2 characters</Text>
      )}
      {searching && <ActivityIndicator color={theme.accent} style={{ marginVertical: 8 }} />}
      {!searching && username.trim().length >= 2 && searchResults.length === 0 && (
        <Text style={styles.hint}>No result</Text>
      )}
      {searchResults.length > 0 && (
        <View style={styles.searchList}>
          {searchResults.map((user) => (
            <TouchableOpacity
              key={user.id}
              style={styles.searchRow}
              disabled={user.relationship !== "none"}
              onPress={() =>
                void sendFriendRequest(session.token, user.username)
                  .then(() => {
                    setUsername("");
                    setSearchResults([]);
                    return refresh();
                  })
                  .catch((e) => alert(friendlyError(e)))
              }
            >
              <Text style={styles.name}>@{user.username}</Text>
              <Text style={styles.muted}>
                {user.relationship === "none"
                  ? "Add"
                  : user.relationship === "friend"
                    ? "Friends"
                    : "Pending"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={[
            ...incoming.map((r) => ({ type: "request" as const, item: r })),
            ...friends.map((f) => ({ type: "friend" as const, item: f })),
          ]}
          keyExtractor={(row) =>
            row.type === "request" ? `req-${row.item.id}` : `friend-${row.item.userId}`
          }
          renderItem={({ item: row }) =>
            row.type === "request" ? (
              <View style={styles.card}>
                <Text style={styles.name}>@{row.item.senderUsername}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={() =>
                      void acceptFriendRequest(session.token, row.item.id).then(refresh)
                    }
                  >
                    <Text style={styles.link}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      void rejectFriendRequest(session.token, row.item.id).then(refresh)
                    }
                  >
                    <Text style={styles.muted}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: "/conversation/[peerId]",
                    params: { peerId: row.item.userId, peerUsername: row.item.username },
                  })
                }
              >
                <Text style={styles.name}>@{row.item.username}</Text>
              </TouchableOpacity>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgApp, padding: 16 },
  title: { color: theme.textPrimary, fontSize: 22, fontWeight: "600", marginBottom: 16 },
  row: { flexDirection: "row", gap: 8, marginBottom: 12 },
  inputFull: {
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 4,
  },
  hint: { color: theme.textMuted, fontSize: 12, marginBottom: 8 },
  searchList: { marginBottom: 12 },
  searchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.bgPanel,
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  input: {
    flex: 1,
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    borderRadius: 8,
    padding: 12,
  },
  btn: { backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  btnText: { color: theme.bgApp, fontWeight: "600" },
  card: {
    backgroundColor: theme.bgPanel,
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  name: { color: theme.textPrimary, fontSize: 16 },
  actions: { flexDirection: "row", gap: 16, marginTop: 8 },
  link: { color: theme.accent },
  muted: { color: theme.textMuted },
});
