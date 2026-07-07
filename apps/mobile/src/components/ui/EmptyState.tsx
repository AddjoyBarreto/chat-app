import { StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xxl,
  },
  icon: { fontSize: 48, marginBottom: theme.spacing.md, opacity: 0.7 },
  title: {
    color: theme.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: "600",
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  description: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.md,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
});
