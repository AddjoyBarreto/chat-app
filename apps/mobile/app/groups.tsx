import { GroupCipher } from "@vaultchat/crypto";
import {
  createGroup,
  distributeGroupKey,
  fetchGroups,
  friendlyError,
  redeemInvite,
  saveGroupKey,
} from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { useApp, storage } from "@/context/AppContext";
import { theme } from "@/theme";

export default function GroupsScreen() {
  const { session, device } = useApp();
  const router = useRouter();
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof fetchGroups>>>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  if (!session) return <Redirect href="/register" />;

  useEffect(() => {
    void (async () => {
      try {
        setGroups(await fetchGroups(session.token));
      } finally {
        setLoading(false);
      }
    })();
  }, [session.token]);

  async function handleCreate() {
    if (!session || !device || !name.trim()) return;
    setCreating(true);
    try {
      const memberUsernames = members
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const group = await createGroup(session.token, {
        name: name.trim(),
        memberUsernames,
      });
      const { keyBase64 } = await GroupCipher.generate();
      await saveGroupKey(storage, session.userId, group.id, keyBase64);
      await distributeGroupKey(storage, session.token, device, session.userId, group.id, keyBase64);
      setGroups(await fetchGroups(session.token));
      setName("");
      setMembers("");
      router.push({ pathname: "/group/[groupId]", params: { groupId: group.id, groupName: group.name } });
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    if (!session || !inviteCode.trim()) return;
    setJoining(true);
    try {
      const result = await redeemInvite(session.token, inviteCode.trim());
      setGroups(await fetchGroups(session.token));
      setInviteCode("");
      Alert.alert("Joined", result.communityName);
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setJoining(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.createBox}>
        <Text style={styles.sectionTitle}>Join community</Text>
        <TextInput
          style={styles.input}
          placeholder="Invite code"
          placeholderTextColor={theme.textMuted}
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.btn}
          onPress={() => void handleJoin()}
          disabled={joining || !inviteCode.trim()}
        >
          {joining ? (
            <ActivityIndicator color={theme.bgApp} />
          ) : (
            <Text style={styles.btnText}>Join</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.createBox}>
        <Text style={styles.sectionTitle}>Create group</Text>
        <TextInput
          style={styles.input}
          placeholder="Group name"
          placeholderTextColor={theme.textMuted}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Members (usernames, comma-separated)"
          placeholderTextColor={theme.textMuted}
          value={members}
          onChangeText={setMembers}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.btn} onPress={() => void handleCreate()} disabled={creating}>
          {creating ? <ActivityIndicator color={theme.bgApp} /> : <Text style={styles.btnText}>Create group</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() =>
                router.push({
                  pathname: "/group/[groupId]",
                  params: { groupId: item.id, groupName: item.name },
                })
              }
            >
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>{item.memberCount} members · 🔒 E2EE</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No groups yet</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgPanel },
  createBox: { padding: 12, gap: 8, backgroundColor: theme.bgHeader, marginBottom: 8 },
  sectionTitle: { color: theme.textSecondary, fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  input: {
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    padding: 12,
    borderRadius: 8,
  },
  btn: {
    backgroundColor: theme.accent,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnText: { color: theme.bgApp, fontWeight: "600" },
  item: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  itemName: { color: theme.textPrimary, fontSize: 16, fontWeight: "500" },
  itemMeta: { color: theme.textSecondary, fontSize: 13, marginTop: 4 },
  empty: { color: theme.textSecondary, textAlign: "center", marginTop: 32 },
});
