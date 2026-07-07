import { PRESENCE_OPTIONS, presenceColor, presenceLabel } from "@vaultchat/client";
import type { SettablePresenceStatus } from "@vaultchat/protocol";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

export function PresenceStatusPicker({
  value,
  onChange,
  disabled,
}: {
  value: SettablePresenceStatus;
  onChange: (status: SettablePresenceStatus) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <View style={[styles.dot, { backgroundColor: presenceColor(value) }]} />
        <Text style={styles.label}>{presenceLabel(value)}</Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Set your status</Text>
            {PRESENCE_OPTIONS.map((opt) => {
              const selected = opt.value === value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionIcon}>{opt.icon}</Text>
                  <View style={styles.optionText}>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    <Text style={styles.optionDesc}>{opt.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.bgElevated,
  },
  triggerDisabled: { opacity: 0.6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { color: theme.textSecondary, fontSize: theme.fontSize.sm, fontWeight: "600" },
  caret: { color: theme.textMuted, fontSize: theme.fontSize.sm },
  backdrop: {
    flex: 1,
    backgroundColor: theme.overlay,
    justifyContent: "flex-end",
  },
  menu: {
    backgroundColor: theme.bgPanel,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  menuTitle: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  optionSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.accentMuted,
  },
  optionIcon: { fontSize: 20 },
  optionText: { flex: 1 },
  optionLabel: { color: theme.textPrimary, fontSize: theme.fontSize.md, fontWeight: "600" },
  optionDesc: { color: theme.textMuted, fontSize: theme.fontSize.sm, marginTop: 2 },
});
