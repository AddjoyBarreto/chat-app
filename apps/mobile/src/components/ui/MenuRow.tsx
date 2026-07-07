import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

interface MenuRowProps {
  icon: string;
  label: string;
  description?: string;
  onPress: () => void;
  danger?: boolean;
  badge?: string;
}

export function MenuRow({ icon, label, description, onPress, danger, badge }: MenuRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.body}>
        <Text style={[styles.label, danger && styles.danger]}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

interface MenuSectionProps {
  title: string;
  children: ReactNode;
}

export function MenuSection({ title, children }: MenuSectionProps) {
  return (
    <View style={sectionStyles.section}>
      <Text style={sectionStyles.sectionTitle}>{title}</Text>
      <View style={sectionStyles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    backgroundColor: theme.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  pressed: { backgroundColor: theme.bgPanel },
  icon: { fontSize: 22, width: 28, textAlign: "center" },
  body: { flex: 1 },
  label: { color: theme.textPrimary, fontSize: theme.fontSize.lg, fontWeight: "500" },
  danger: { color: theme.danger },
  description: { color: theme.textMuted, fontSize: theme.fontSize.sm, marginTop: 2 },
  badge: {
    backgroundColor: theme.accentMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  badgeText: { color: theme.accent, fontSize: theme.fontSize.xs, fontWeight: "600" },
  chevron: { color: theme.textMuted, fontSize: 22, fontWeight: "300" },
});

const sectionStyles = StyleSheet.create({
  section: { marginBottom: theme.spacing.xl },
  sectionTitle: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  sectionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    overflow: "hidden",
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.lg,
  },
});
