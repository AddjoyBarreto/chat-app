import {
  formatCountryOption,
  getCountryDialCode,
  getPhoneCountry,
  PHONE_COUNTRIES,
  type PhoneCountry,
} from "@vaultchat/client";
import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { theme } from "@/theme";

interface CountryPickerProps {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  compact?: boolean;
}

export function CountryPicker({
  value,
  onChange,
  disabled,
  hasError,
  compact = false,
}: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = getPhoneCountry(value);
  const dialCode = getCountryDialCode(value);

  const filtered = PHONE_COUNTRIES.filter((country) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      country.name.toLowerCase().includes(q) ||
      country.dial.includes(q) ||
      country.iso.toLowerCase().includes(q)
    );
  });

  function selectCountry(country: PhoneCountry) {
    onChange(country.iso);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Pressable
        style={[
          compact ? styles.triggerCompact : styles.trigger,
          hasError && styles.triggerError,
          disabled && styles.disabled,
        ]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityLabel="Select country"
      >
        <Text style={compact ? styles.dialText : styles.triggerText} numberOfLines={1}>
          {compact ? dialCode : selected ? formatCountryOption(selected) : "Country"}
        </Text>
        {compact ? <Text style={styles.chevron}>▾</Text> : null}
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Select country</Text>
            <TextInput
              style={styles.search}
              placeholder="Search country"
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.iso}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.option} onPress={() => selectCountry(item)}>
                  <Text style={styles.optionText}>{formatCountryOption(item)}</Text>
                </Pressable>
              )}
            />
            <Pressable style={styles.cancelBtn} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flex: 1,
    backgroundColor: theme.bgInput,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  triggerCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: 88,
    backgroundColor: theme.bgInput,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  triggerError: { borderColor: theme.danger },
  disabled: { opacity: 0.7 },
  triggerText: { color: theme.textPrimary, fontSize: theme.fontSize.md },
  dialText: { color: theme.textPrimary, fontSize: theme.fontSize.lg, fontWeight: "600" },
  chevron: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  overlay: {
    flex: 1,
    backgroundColor: theme.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.bgPanel,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    maxHeight: "70%",
    padding: theme.spacing.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: "center",
    marginBottom: theme.spacing.md,
  },
  title: {
    color: theme.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: "600",
    marginBottom: theme.spacing.md,
  },
  search: {
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    fontSize: theme.fontSize.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  option: {
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  optionText: { color: theme.textPrimary, fontSize: theme.fontSize.lg },
  cancelBtn: { alignItems: "center", paddingVertical: theme.spacing.lg, marginTop: theme.spacing.sm },
  cancelText: { color: theme.accent, fontSize: theme.fontSize.lg, fontWeight: "600" },
});
