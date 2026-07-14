import {
  getLoginHint,
  hasFieldErrors,
  loginOnServer,
  mapLoginError,
  persistDevice,
  provisionDeviceForLogin,
  saveSession,
  type LoginFieldErrors,
} from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, StyleSheet, Text, TouchableOpacity } from "react-native";
import { AuthScreen } from "@/components/ui/AuthScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useApp, storage } from "@/context/AppContext";
import { ensureMobileCrypto } from "@/lib/mobileCrypto";
import { theme } from "@/theme";

export default function LoginScreen() {
  const { session, setSession, setDevice } = useApp();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginFieldErrors>({});
  const [loading, setLoading] = useState(false);

  if (session) {
    if (session.emailVerified === false) return <Redirect href="/verify-email" />;
    return <Redirect href="/chats" />;
  }

  async function handleLogin() {
    const nextErrors: LoginFieldErrors = {};
    if (!identifier.trim()) nextErrors.identifier = "Username or email is required.";
    if (!password) nextErrors.password = "Password is required.";
    if (hasFieldErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setLoading(true);

    const id = identifier.trim().toLowerCase();
    const hint = await getLoginHint(storage, id);

    try {
      ensureMobileCrypto();
      const preLogin = await loginOnServer({
        identifier: id,
        password,
        deviceId: hint?.deviceId ?? 1,
        deviceName: Platform.OS,
      });

      const { login, device, isNewLinkedDevice, restoredHistory } =
        await provisionDeviceForLogin(storage, {
        identifier: id,
        password,
        userId: preLogin.userId,
        deviceIdHint: hint?.deviceId ?? preLogin.deviceId,
        token: preLogin.token,
        deviceName: Platform.OS,
      });

      const stored = {
        username: login.username,
        userId: login.userId,
        token: login.token,
        deviceId: login.deviceId,
        emailVerified: login.emailVerified,
      };

      await saveSession(storage, stored, id.includes("@") ? id : undefined);
      await persistDevice(storage, device, login.userId);
      setDevice(device);
      setSession(stored);

      const restoredCount =
        (restoredHistory?.messages ?? 0) + (restoredHistory?.timelines ?? 0);
      if (restoredCount > 0) {
        Alert.alert("History restored", "Your previous chats were restored from backup.");
      } else if (isNewLinkedDevice) {
        Alert.alert(
          "New device",
          "This install has new encryption keys. Previous messages stay on devices that already had them. New messages will work normally."
        );
      }

      if (login.emailVerified) {
        router.replace("/chats");
      } else {
        router.replace("/verify-email");
      }
    } catch (e) {
      setErrors(mapLoginError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen
      title="Sign in"
      subtitle="Welcome back. Your messages stay encrypted on this device."
      footer={
        <TouchableOpacity onPress={() => router.push("/register")} disabled={loading}>
          <Text style={styles.footerText}>
            No account? <Text style={styles.footerLink}>Create one</Text>
          </Text>
        </TouchableOpacity>
      }
    >
      <Input
        placeholder="Username or email"
        autoCapitalize="none"
        autoCorrect={false}
        value={identifier}
        onChangeText={setIdentifier}
        error={errors.identifier}
      />

      <Input
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        error={errors.password}
      />

      {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

      <Button title="Sign in" onPress={() => void handleLogin()} loading={loading} style={styles.submit} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: theme.spacing.sm },
  formError: {
    color: theme.danger,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  footerText: { color: theme.textSecondary, fontSize: theme.fontSize.md },
  footerLink: { color: theme.accent, fontWeight: "600" },
});
