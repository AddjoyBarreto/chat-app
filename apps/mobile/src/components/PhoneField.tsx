import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { CountryPicker } from "@/components/CountryPicker";
import { theme } from "@/theme";

interface PhoneFieldProps {
  country: string;
  phoneNumber: string;
  onCountryChange: (iso: string) => void;
  onPhoneChange: (value: string) => void;
  onBlur?: TextInputProps["onBlur"];
  error?: string;
  valid?: boolean;
  disabled?: boolean;
}

export function PhoneField({
  country,
  phoneNumber,
  onCountryChange,
  onPhoneChange,
  onBlur,
  error,
  valid,
  disabled,
}: PhoneFieldProps) {
  const borderStyle = error ? styles.fieldError : valid ? styles.fieldValid : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <CountryPicker
          value={country}
          onChange={onCountryChange}
          disabled={disabled}
          hasError={!!error}
          compact
        />
        <TextInput
            style={[styles.phoneInput, borderStyle]}
            placeholder="Phone number"
            placeholderTextColor={theme.textMuted}
            value={phoneNumber}
            onChangeText={onPhoneChange}
            onBlur={onBlur}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
          editable={!disabled}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", marginBottom: theme.spacing.sm },
  row: { flexDirection: "row", alignItems: "stretch", gap: theme.spacing.sm, width: "100%" },
  phoneInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 14,
    fontSize: theme.fontSize.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  fieldError: { borderColor: theme.danger },
  fieldValid: { borderColor: theme.accent },
  error: {
    color: theme.danger,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
});
