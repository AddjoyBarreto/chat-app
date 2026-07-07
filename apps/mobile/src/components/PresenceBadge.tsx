import type { PresenceStatus } from "@vaultchat/protocol";
import { presenceColor } from "@vaultchat/client";
import { StyleSheet, View, type ViewStyle } from "react-native";

export function PresenceBadge({
  status,
  style,
}: {
  status: PresenceStatus;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: presenceColor(status) },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#111b21",
  },
});
