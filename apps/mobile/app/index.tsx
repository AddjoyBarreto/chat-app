import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useApp } from "@/context/AppContext";
import { theme } from "@/theme";

export default function IndexScreen() {
  const { session, initError, logout, ready } = useApp();

  if (initError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.title}>Setup error</Text>
        <Text style={styles.subtitle}>{initError}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => void logout()}>
          <Text style={styles.btnText}>Reset & register again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
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
    padding: 24,
  },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  title: { color: theme.textPrimary, fontSize: 18, fontWeight: "600", marginBottom: 8 },
  subtitle: { color: theme.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 24 },
  btn: {
    backgroundColor: theme.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnText: { color: theme.bgApp, fontWeight: "600" },
});
