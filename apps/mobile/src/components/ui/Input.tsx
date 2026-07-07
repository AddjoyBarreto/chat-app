import { StyleSheet, Text, TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from "react-native";
import { theme } from "@/theme";

interface InputProps extends TextInputProps {
  error?: string;
  valid?: boolean;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Input({ error, valid, hint, style, containerStyle, ...props }: InputProps) {
  const borderStyle = error ? styles.inputError : valid ? styles.inputValid : null;

  return (
    <View style={[styles.wrap, containerStyle]}>
      <TextInput
        style={[styles.input, borderStyle, style]}
        placeholderTextColor={theme.textMuted}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", marginBottom: theme.spacing.sm },
  input: {
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 14,
    fontSize: theme.fontSize.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  inputError: { borderColor: theme.danger },
  inputValid: { borderColor: theme.accent },
  error: {
    color: theme.danger,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  hint: {
    color: theme.textMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
});
