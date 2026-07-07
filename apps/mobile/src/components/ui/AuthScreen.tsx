import { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/theme";

interface AuthScreenProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  scroll?: boolean;
  footer?: ReactNode;
}

export function AuthScreen({ children, title, subtitle, scroll, footer }: AuthScreenProps) {
  const body = (
    <View style={styles.card}>
      <Text style={styles.logo}>🔒</Text>
      <Text style={styles.brand}>VaultChat</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.form}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {body}
          </ScrollView>
        ) : (
          <View style={styles.center}>{body}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bgApp },
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", padding: theme.spacing.xl },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.spacing.xl,
  },
  card: { width: "100%", maxWidth: 400, alignSelf: "center" },
  logo: { fontSize: 52, textAlign: "center", marginBottom: theme.spacing.sm },
  brand: {
    color: theme.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: theme.spacing.sm,
  },
  title: {
    color: theme.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.md,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },
  form: { gap: theme.spacing.xs },
  footer: { marginTop: theme.spacing.xl, alignItems: "center" },
});
