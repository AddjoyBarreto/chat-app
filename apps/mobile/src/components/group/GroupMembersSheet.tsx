import {
  blockUser,
  demoteCommunityMember,
  kickCommunityMember,
  presenceLabel,
  promoteCommunityMember,
  sendFriendRequest,
  friendlyError,
} from "@vaultchat/client";
import type { GroupMemberInfo, PresenceStatus } from "@vaultchat/protocol";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose } from "@/components/icons/CommunityIcons";
import { PresenceBadge } from "@/components/PresenceBadge";
import { useApp } from "@/context/AppContext";
import { useFriendsContext } from "@/context/FriendsContext";
import { theme } from "@/theme";

interface GroupMembersSheetProps {
  visible: boolean;
  communityId: string;
  communityName: string;
  members: GroupMemberInfo[];
  isAdmin: boolean;
  isOwner?: boolean;
  createdBy?: string | null;
  getPresence: (userId: string) => PresenceStatus;
  onClose: () => void;
  onMembersChanged?: () => void;
  onShareKey?: (userId: string) => Promise<void>;
}

export function GroupMembersSheet({
  visible,
  communityId,
  communityName,
  members,
  isAdmin,
  isOwner = false,
  createdBy = null,
  getPresence,
  onClose,
  onMembersChanged,
  onShareKey,
}: GroupMembersSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useApp();
  const friends = useFriendsContext();
  const [selected, setSelected] = useState<GroupMemberInfo | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const online = members.filter((m) => getPresence(m.userId) !== "offline");
  const offline = members.filter((m) => getPresence(m.userId) === "offline");
  const friendIds = useMemo(
    () => new Set(friends.friends.map((f) => f.userId)),
    [friends.friends]
  );

  function closeProfile() {
    setSelected(null);
    setDraft("");
  }

  function openDm(member: GroupMemberInfo, text?: string) {
    closeProfile();
    onClose();
    router.push({
      pathname: "/conversation/[peerId]",
      params: {
        peerId: member.userId,
        peerUsername: member.username,
        ...(text ? { draft: text } : {}),
      },
    });
  }

  async function run(action: () => Promise<void>) {
    if (!session) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function renderMember(m: GroupMemberInfo, dimmed?: boolean) {
    const status = getPresence(m.userId);
    return (
      <Pressable
        key={m.userId}
        style={[styles.memberRow, dimmed && styles.memberOffline]}
        onPress={() => setSelected(m)}
      >
        <View>
          <Avatar name={m.username} size={36} />
          <PresenceBadge status={status} style={styles.presence} />
        </View>
        <View style={styles.memberBody}>
          <Text style={styles.memberName}>{m.username}</Text>
          <Text style={styles.memberStatus}>{presenceLabel(status)}</Text>
        </View>
        {m.role === "admin" ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>Admin</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  const isSelf = selected?.userId === session?.userId;
  const status = selected ? getPresence(selected.userId) : "offline";

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={[styles.sheet, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Members</Text>
            <Text style={styles.subtitle}>{communityName}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <IconClose size={22} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {online.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Online — {online.length}</Text>
                {online.map((m) => renderMember(m))}
              </View>
            )}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Offline — {offline.length}</Text>
              {offline.map((m) => renderMember(m, true))}
            </View>
          </ScrollView>
        </View>
      </View>

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={closeProfile}>
        <View style={styles.profileOverlay}>
          <Pressable style={styles.profileDismiss} onPress={closeProfile} />
          {selected && (
            <View style={[styles.profileCard, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.profileBanner}>
                <Pressable style={styles.profileMore} onPress={closeProfile} hitSlop={8}>
                  <Text style={styles.profileMoreText}>✕</Text>
                </Pressable>
              </View>
              <View style={styles.profileAvatarWrap}>
                <Avatar name={selected.username} size={72} />
                <PresenceBadge status={status} style={styles.profilePresence} />
              </View>
              <Text style={styles.profileDisplay}>{selected.username}</Text>
              <Text style={styles.profileUsername}>@{selected.username}</Text>
              <Text style={styles.profileStatus}>{presenceLabel(status)}</Text>

              <View style={styles.rolesBox}>
                <Text style={styles.rolesLabel}>Roles</Text>
                <View style={styles.roleRow}>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleText}>
                      {selected.role === "admin" ? "Admin" : "Member"}
                    </Text>
                  </View>
                  {isAdmin && !isSelf && selected.role !== "admin" ? (
                    <Pressable
                      onPress={() =>
                        void run(async () => {
                          if (!session) return;
                          await promoteCommunityMember(session.token, communityId, selected.userId);
                          onMembersChanged?.();
                          closeProfile();
                        })
                      }
                      disabled={busy}
                    >
                      <Text style={styles.addRole}>+ Make admin</Text>
                    </Pressable>
                  ) : null}
                  {isOwner &&
                  !isSelf &&
                  selected.role === "admin" &&
                  selected.userId !== createdBy ? (
                    <Pressable
                      onPress={() =>
                        Alert.alert(
                          "Remove admin",
                          `Remove admin from ${selected.username}?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Remove",
                              style: "destructive",
                              onPress: () =>
                                void run(async () => {
                                  if (!session) return;
                                  await demoteCommunityMember(
                                    session.token,
                                    communityId,
                                    selected.userId
                                  );
                                  onMembersChanged?.();
                                  closeProfile();
                                }),
                            },
                          ]
                        )
                      }
                      disabled={busy}
                    >
                      <Text style={styles.addRole}>Remove admin</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {!isSelf && (
                <>
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => openDm(selected, draft.trim() || undefined)}
                    >
                      <Text style={styles.actionText}>Message</Text>
                    </Pressable>
                    {!friendIds.has(selected.userId) && (
                      <Pressable
                        style={styles.actionBtn}
                        disabled={busy}
                        onPress={() =>
                          void run(async () => {
                            if (!session) return;
                            await sendFriendRequest(session.token, selected.username);
                            await friends.refresh();
                            Alert.alert("Friend request sent", `@${selected.username}`);
                          })
                        }
                      >
                        <Text style={styles.actionText}>Add Friend</Text>
                      </Pressable>
                    )}
                    {isAdmin && onShareKey && (
                      <Pressable
                        style={styles.actionBtn}
                        disabled={busy}
                        onPress={() =>
                          void run(async () => {
                            await onShareKey(selected.userId);
                            Alert.alert("Key shared", `Encryption key sent to @${selected.username}`);
                          })
                        }
                      >
                        <Text style={styles.actionText}>Share key</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.actionBtn, styles.actionDanger]}
                      disabled={busy}
                      onPress={() =>
                        Alert.alert("Block user", `Block @${selected.username}?`, [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Block",
                            style: "destructive",
                            onPress: () =>
                              void run(async () => {
                                if (!session) return;
                                await blockUser(session.token, selected.username);
                                closeProfile();
                              }),
                          },
                        ])
                      }
                    >
                      <Text style={[styles.actionText, styles.actionDangerText]}>Block</Text>
                    </Pressable>
                    {isAdmin && selected.role !== "admin" && (
                      <Pressable
                        style={[styles.actionBtn, styles.actionDanger]}
                        disabled={busy}
                        onPress={() =>
                          Alert.alert(
                            "Kick member",
                            `Remove ${selected.username} from this server?`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Kick",
                                style: "destructive",
                                onPress: () =>
                                  void run(async () => {
                                    if (!session) return;
                                    await kickCommunityMember(
                                      session.token,
                                      communityId,
                                      selected.userId
                                    );
                                    onMembersChanged?.();
                                    closeProfile();
                                  }),
                              },
                            ]
                          )
                        }
                      >
                        <Text style={[styles.actionText, styles.actionDangerText]}>
                          Kick from server
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.compose}>
                    <TextInput
                      style={styles.composeInput}
                      placeholder={`Message @${selected.username}`}
                      placeholderTextColor={theme.textMuted}
                      value={draft}
                      onChangeText={setDraft}
                    />
                    <Pressable
                      style={styles.composeSend}
                      onPress={() => openDm(selected, draft.trim() || undefined)}
                    >
                      {busy ? (
                        <ActivityIndicator color={theme.bgApp} size="small" />
                      ) : (
                        <Text style={styles.composeSendText}>➤</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row", backgroundColor: theme.overlay },
  dismiss: { flex: 1 },
  sheet: {
    width: "86%",
    maxWidth: 320,
    backgroundColor: theme.bgPanel,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: theme.border,
  },
  header: {
    padding: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  title: { color: theme.textPrimary, fontSize: theme.fontSize.xl, fontWeight: "700" },
  subtitle: { color: theme.textMuted, fontSize: theme.fontSize.sm, marginTop: 2 },
  closeBtn: { position: "absolute", right: theme.spacing.lg, top: theme.spacing.lg },
  list: { padding: theme.spacing.md, gap: theme.spacing.lg },
  section: { gap: theme.spacing.xs },
  sectionTitle: {
    color: theme.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
  },
  memberOffline: { opacity: 0.55 },
  presence: { position: "absolute", right: -1, bottom: -1 },
  memberBody: { flex: 1 },
  memberName: { color: theme.textPrimary, fontSize: theme.fontSize.md, fontWeight: "600" },
  memberStatus: { color: theme.textMuted, fontSize: theme.fontSize.sm, marginTop: 1 },
  roleBadge: {
    backgroundColor: theme.accentMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  roleText: { color: theme.accent, fontSize: theme.fontSize.xs, fontWeight: "600" },
  profileOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  profileDismiss: { flex: 1 },
  profileCard: {
    backgroundColor: theme.bgPanel,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: theme.spacing.lg,
  },
  profileBanner: {
    height: 72,
    marginHorizontal: -theme.spacing.lg,
    backgroundColor: "#1f4e79",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  profileMore: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileMoreText: { color: "#fff", fontSize: 14 },
  profileAvatarWrap: { marginTop: -36, width: 72 },
  profilePresence: { position: "absolute", right: 0, bottom: 0 },
  profileDisplay: {
    color: theme.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: "700",
    marginTop: theme.spacing.md,
  },
  profileUsername: { color: theme.textMuted, fontSize: theme.fontSize.md },
  profileStatus: { color: theme.textSecondary, fontSize: theme.fontSize.sm, marginTop: 4 },
  rolesBox: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.bgElevated,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  rolesLabel: {
    color: theme.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: theme.spacing.sm,
  },
  roleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  addRole: { color: theme.textMuted, fontSize: theme.fontSize.sm },
  actions: { marginTop: theme.spacing.md, gap: 6 },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.bgElevated,
  },
  actionText: { color: theme.textPrimary, fontSize: theme.fontSize.md, fontWeight: "600" },
  actionDanger: { backgroundColor: "rgba(242,63,67,0.12)" },
  actionDangerText: { color: theme.danger },
  compose: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    alignItems: "center",
  },
  composeInput: {
    flex: 1,
    backgroundColor: theme.bgInput,
    borderRadius: theme.radius.md,
    color: theme.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
  },
  composeSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  composeSendText: { color: theme.bgApp, fontSize: 16 },
});
