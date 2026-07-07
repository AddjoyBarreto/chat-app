import { GroupCipher } from "@vaultchat/crypto";
import {
  createGroup,
  distributeGroupKey,
  fetchGroups,
  friendlyError,
  parseMemberUsernames,
  redeemInvite,
  saveGroupKey,
} from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { useApp, storage } from "@/context/AppContext";
import { useFriendsContext } from "@/context/FriendsContext";
import { FriendMembersInput } from "@/components/FriendMembersInput";
import { theme } from "@/theme";

type ActionMode = "join" | "create";

export default function GroupsScreen() {
  const { session, device } = useApp();
  const { friends } = useFriendsContext();
  const router = useRouter();
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof fetchGroups>>>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ActionMode>("join");
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
      const memberUsernames = parseMemberUsernames(members);
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

  function renderActionForm() {
    if (mode === "join") {
      return (
        <View style={styles.form}>
          <Input
            placeholder="Paste invite code"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="none"
            autoCorrect={false}
            containerStyle={styles.inputLast}
          />
          <Button
            title="Join community"
            onPress={() => void handleJoin()}
            loading={joining}
            disabled={!inviteCode.trim()}
          />
        </View>
      );
    }

    return (
      <View style={styles.form}>
        <Input placeholder="Group name" value={name} onChangeText={setName} />
        <FriendMembersInput
          friends={friends}
          value={members}
          onChange={setMembers}
          placeholder="Add friends by username…"
          disabled={creating}
        />
        <Button
          title="Create group"
          onPress={() => void handleCreate()}
          loading={creating}
          disabled={!name.trim()}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.actionSection}>
        <Text style={styles.actionHeading}>
          {groups.length === 0 ? "Get started" : "Add or create"}
        </Text>
        <View style={styles.segment}>
          <Pressable
            style={[styles.segmentBtn, mode === "join" && styles.segmentBtnActive]}
            onPress={() => setMode("join")}
          >
            <Text style={[styles.segmentText, mode === "join" && styles.segmentTextActive]}>
              Join
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentBtn, mode === "create" && styles.segmentBtnActive]}
            onPress={() => setMode("create")}
          >
            <Text style={[styles.segmentText, mode === "create" && styles.segmentTextActive]}>
              Create
            </Text>
          </Pressable>
        </View>
        {renderActionForm()}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={styles.listSpinner} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={groups.length === 0 ? styles.listEmpty : styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            groups.length > 0 ? (
              <Text style={styles.listTitle}>Your communities ({groups.length})</Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="🏘️"
              title="No communities yet"
              description="Join with an invite code or create a new encrypted group above."
            />
          }
          renderItem={({ item }) => (
            <Card
              style={styles.groupCard}
              onPress={() =>
                router.push({
                  pathname: "/group/[groupId]",
                  params: { groupId: item.id, groupName: item.name },
                })
              }
            >
              <View style={styles.itemRow}>
                <Avatar name={item.name} size={48} />
                <View style={styles.itemBody}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>
                    {item.memberCount} {item.memberCount === 1 ? "member" : "members"} · 🔒 Encrypted
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </Card>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgApp },
  actionSection: {
    padding: theme.spacing.lg,
    backgroundColor: theme.bgHeader,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  actionHeading: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    marginBottom: theme.spacing.md,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: theme.bgInput,
    borderRadius: theme.radius.pill,
    padding: 3,
    marginBottom: theme.spacing.md,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: theme.bgElevated,
  },
  segmentText: {
    color: theme.textMuted,
    fontSize: theme.fontSize.md,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: theme.textPrimary,
  },
  form: { gap: 0 },
  inputLast: { marginBottom: theme.spacing.md },
  listSpinner: { marginTop: theme.spacing.xxl },
  list: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  listEmpty: { flexGrow: 1 },
  listTitle: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: theme.spacing.md,
  },
  groupCard: { marginBottom: theme.spacing.sm },
  itemRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  itemBody: { flex: 1 },
  itemName: { color: theme.textPrimary, fontSize: theme.fontSize.lg, fontWeight: "600" },
  itemMeta: { color: theme.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
  chevron: { color: theme.textMuted, fontSize: 22, fontWeight: "300" },
});
