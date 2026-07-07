import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { avatarColorFor, theme } from "@/theme";

interface AvatarProps {
  name: string;
  size?: number;
  style?: ViewStyle;
}

export function Avatar({ name, size = 48, style }: AvatarProps) {
  const initial = name[0]?.toUpperCase() ?? "?";
  const fontSize = size * 0.38;

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: avatarColorFor(name),
        },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  text: { color: theme.textPrimary, fontWeight: "600" },
});
