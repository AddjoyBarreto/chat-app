import type { VoicePresenceInfo } from "@vaultchat/protocol";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { theme } from "@/theme";

interface GroupVoiceViewProps {
  channelName: string;
  members: VoicePresenceInfo[];
  inVoice: boolean;
  loading: boolean;
  onToggleVoice: () => void;
}

export function GroupVoiceView({
  channelName,
  members,
  inVoice,
  loading,
  onToggleVoice,
}: GroupVoiceViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <Text style={styles.icon}>🔊</Text>
        <Text style={styles.title}>{channelName}</Text>
        <Text style={styles.subtitle}>Hang out together with voice.</Text>
        <Pressable
          style={[styles.joinBtn, inVoice && styles.joinBtnActive]}
          onPress={onToggleVoice}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.bgApp} size="small" />
          ) : (
            <Text style={styles.joinText}>{inVoice ? "Disconnect" : "Join Voice"}</Text>
          )}
        </Pressable>
      </View>
      <View style={styles.memberSection}>
        <Text style={styles.memberTitle}>In channel — {members.length}</Text>
        {members.length === 0 ? (
          <Text style={styles.empty}>No one is in this channel yet.</Text>
        ) : (
          members.map((m) => (
            <View key={m.userId} style={styles.memberRow}>
              <Avatar name={m.username} size={36} />
              <Text style={styles.memberName}>{m.username}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgApp },
  stage: {
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xxl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  icon: { fontSize: 48, marginBottom: theme.spacing.md },
  title: { color: theme.textPrimary, fontSize: theme.fontSize.xl, fontWeight: "700" },
  subtitle: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.md,
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  joinBtn: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.accent,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.pill,
    minWidth: 140,
    alignItems: "center",
  },
  joinBtnActive: { backgroundColor: theme.danger },
  joinText: { color: theme.bgApp, fontWeight: "700", fontSize: theme.fontSize.md },
  memberSection: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  memberTitle: {
    color: theme.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: theme.spacing.sm,
  },
  empty: { color: theme.textMuted, fontSize: theme.fontSize.md },
  memberRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingVertical: 6 },
  memberName: { color: theme.textPrimary, fontSize: theme.fontSize.md, fontWeight: "500" },
});
