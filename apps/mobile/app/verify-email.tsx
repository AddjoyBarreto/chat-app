import {
  bootstrapDevice,
  fetchMe,
  friendlyError,
  resendVerificationEmail,
  saveSession,
} from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp, storage } from "@/context/AppContext";
import { theme } from "@/theme";

export default function VerifyEmailScreen() {
  const { session, logout, setSession, setDevice } = useApp();
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!session) return <Redirect href="/login" />;
  if (session.emailVerified !== false) return <Redirect href="/chats" />;

  async function handleResend() {
    if (!session) return;
    setResending(true);
    setMessage(null);
    try {
      await resendVerificationEmail(session.token);
      setMessage("Verification email sent.");
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setResending(false);
    }
  }

  async function handleCheckVerified() {
    if (!session) return;
    setChecking(true);
    setMessage(null);
    try {
      const me = await fetchMe(session.token);
      if (me.emailVerified) {
        const updated = { ...session, emailVerified: true };
        await saveSession(storage, updated);
        setSession(updated);
        const dev = await bootstrapDevice(storage, updated);
        setDevice(dev);
        router.replace("/chats");
      } else {
        setMessage("Email not verified yet. Check your inbox.");
      }
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>✉️</Text>
      <Text style={styles.title}>Verify your email</Text>
      <Text style={styles.subtitle}>
        We sent a verification link to your inbox. Open it, then tap below.
      </Text>
      <Text style={styles.hint}>
        Local dev: check the API server terminal for the verification URL if SMTP is not set.
      </Text>

      {message && <Text style={styles.message}>{message}</Text>}

      <TouchableOpacity
        style={[styles.btn, resending && styles.btnDisabled]}
        onPress={() => void handleResend()}
        disabled={resending}
      >
        {resending ? (
          <ActivityIndicator color={theme.bgApp} />
        ) : (
          <Text style={styles.btnText}>Resend email</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.btnSecondary, checking && styles.btnDisabled]}
        onPress={() => void handleCheckVerified()}
        disabled={checking}
      >
        {checking ? (
          <ActivityIndicator color={theme.accent} />
        ) : (
          <Text style={styles.btnSecondaryText}>I&apos;ve verified my email</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkBtn} onPress={() => void logout()}>
        <Text style={styles.linkText}>Back to sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bgApp,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  logo: { fontSize: 64, marginBottom: 16 },
  title: { color: theme.textPrimary, fontSize: 24, fontWeight: "600", marginBottom: 8 },
  subtitle: {
    color: theme.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 12,
    maxWidth: 300,
  },
  hint: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginBottom: 24,
    maxWidth: 280,
  },
  message: { color: theme.accent, marginBottom: 16, textAlign: "center" },
  btn: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: theme.accent,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.accent },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: theme.bgApp, fontWeight: "600", fontSize: 16 },
  btnSecondaryText: { color: theme.accent, fontWeight: "600", fontSize: 16 },
  linkBtn: { marginTop: 16 },
  linkText: { color: theme.textMuted, fontSize: 14 },
});
