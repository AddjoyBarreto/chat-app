import { Pressable, StyleSheet, View, type PressableProps, type ViewProps } from "react-native";
import { theme } from "@/theme";

interface CardProps extends ViewProps {
  onPress?: PressableProps["onPress"];
}

export function Card({ onPress, style, children, ...props }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
        onPress={onPress}
        {...props}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.bgElevated,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  pressed: { opacity: 0.85 },
});
