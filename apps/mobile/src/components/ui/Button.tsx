import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { theme } from "@/theme";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends Omit<PressableProps, "style"> {
  title: string;
  loading?: boolean;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  loading,
  variant = "primary",
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? theme.bgApp : theme.accent}
          size="small"
        />
      ) : (
        <Text style={[styles.text, textStyles[variant]]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
  text: { fontSize: theme.fontSize.lg, fontWeight: "600" },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: theme.accent },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.accent,
  },
  ghost: { backgroundColor: "transparent" },
});

const textStyles = StyleSheet.create({
  primary: { color: theme.bgApp },
  secondary: { color: theme.accent },
  ghost: { color: theme.accent, fontSize: theme.fontSize.md },
});
