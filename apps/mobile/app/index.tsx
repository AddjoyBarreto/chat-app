import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useApp } from "@/context/AppContext";
import { theme } from "@/theme";

export default function IndexScreen() {
  const { session, initError, logout, ready } = useApp();

  if (initError) {
    return (
      <View style={styles.center}>
        <EmptyState icon="⚠️" title="Setup error" description={initError} />
        <Button
          title="Reset & register again"
          onPress={() => void logout()}
          style={styles.btn}
        />
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.logo}>🔒</Text>
        <Text style={styles.brand}>VaultChat</Text>
        <ActivityIndicator color={theme.accent} style={styles.spinner} />
      </View>
    );
  }

  if (session) {
    if (session.emailVerified === false) return <Redirect href="/verify-email" />;
    return <Redirect href="/chats" />;
  }
  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: theme.bgApp,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xl,
  },
  logo: { fontSize: 52, marginBottom: theme.spacing.sm },
  brand: {
    color: theme.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: theme.spacing.xl,
  },
  spinner: { marginTop: theme.spacing.md },
  btn: { marginTop: theme.spacing.xl, minWidth: 240 },
});
