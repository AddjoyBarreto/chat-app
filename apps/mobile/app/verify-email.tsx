import {
  bootstrapDevice,
  fetchMe,
  friendlyError,
  resendVerificationEmail,
  saveSession,
} from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { AuthScreen } from "@/components/ui/AuthScreen";
import { Button } from "@/components/ui/Button";
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
    <AuthScreen
      title="Verify your email"
      subtitle="We sent a verification link to your inbox. Open it, then tap the button below."
      footer={
        <TouchableOpacity onPress={() => void logout()}>
          <Text style={styles.footerLink}>Back to sign in</Text>
        </TouchableOpacity>
      }
    >
      <Text style={styles.hint}>
        Local dev: check the API server terminal for the verification URL if SMTP is not set.
      </Text>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Button title="Resend email" onPress={() => void handleResend()} loading={resending} />

      <Button
        title="I've verified my email"
        variant="secondary"
        onPress={() => void handleCheckVerified()}
        loading={checking}
        style={styles.secondary}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: theme.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: theme.spacing.lg,
  },
  message: {
    color: theme.accent,
    fontSize: theme.fontSize.md,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  secondary: { marginTop: theme.spacing.sm },
  footerLink: { color: theme.textMuted, fontSize: theme.fontSize.md },
});
