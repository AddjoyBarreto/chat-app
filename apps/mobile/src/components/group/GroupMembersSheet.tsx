import { presenceLabel } from "@vaultchat/client";
import type { GroupMemberInfo, PresenceStatus } from "@vaultchat/protocol";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose } from "@/components/icons/CommunityIcons";
import { PresenceBadge } from "@/components/PresenceBadge";
import { theme } from "@/theme";

interface GroupMembersSheetProps {
  visible: boolean;
  communityName: string;
  members: GroupMemberInfo[];
  getPresence: (userId: string) => PresenceStatus;
  onClose: () => void;
}

export function GroupMembersSheet({
  visible,
  communityName,
  members,
  getPresence,
  onClose,
}: GroupMembersSheetProps) {
  const insets = useSafeAreaInsets();
  const online = members.filter((m) => getPresence(m.userId) !== "offline");
  const offline = members.filter((m) => getPresence(m.userId) === "offline");

  function renderMember(m: GroupMemberInfo, dimmed?: boolean) {
    const status = getPresence(m.userId);
    return (
      <View key={m.userId} style={[styles.memberRow, dimmed && styles.memberOffline]}>
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
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={[styles.sheet, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Members</Text>
            <Text style={styles.subtitle}>{communityName}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
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
  close: {
    position: "absolute",
    right: theme.spacing.lg,
    top: theme.spacing.lg,
    color: theme.textMuted,
    fontSize: 18,
  },
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
});
