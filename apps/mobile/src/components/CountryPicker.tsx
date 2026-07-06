import {
  formatCountryOption,
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
}

export function CountryPicker({ value, onChange, disabled, hasError }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = getPhoneCountry(value);

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
        style={[styles.trigger, hasError && styles.triggerError, disabled && styles.disabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {selected ? formatCountryOption(selected) : "Country"}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 14,
    justifyContent: "center",
  },
  triggerError: { borderWidth: 1, borderColor: theme.danger },
  disabled: { opacity: 0.7 },
  triggerText: { color: theme.textPrimary, fontSize: 14 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.bgApp,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    padding: 16,
  },
  title: { color: theme.textPrimary, fontSize: 18, fontWeight: "600", marginBottom: 12 },
  search: {
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  option: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.bgInput },
  optionText: { color: theme.textPrimary, fontSize: 16 },
  cancelBtn: { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  cancelText: { color: theme.accent, fontSize: 16, fontWeight: "600" },
});
