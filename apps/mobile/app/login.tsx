import { VaultDevice } from "@vaultchat/crypto";
import {
  bootstrapDevice,
  fetchConversations,
  fetchInbox,
  getLoginHint,
  hasFieldErrors,
  loadDevice,
  loadSession,
  loginOnServer,
  mapLoginError,
  persistDevice,
  saveSession,
  syncIdentityWithServer,
  type LoginFieldErrors,
} from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp, storage } from "@/context/AppContext";
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
      let login = await loginOnServer({
        identifier: id,
        password,
        deviceId: hint?.deviceId ?? 1,
        deviceName: Platform.OS,
      });

      let device: VaultDevice;
      try {
        device = await loadDevice(storage, {
          username: login.username,
          userId: login.userId,
          token: login.token,
          deviceId: login.deviceId,
          emailVerified: login.emailVerified,
        });
      } catch {
        device = await VaultDevice.create(login.username);
      }

      const synced = await syncIdentityWithServer(storage, device, {
        identifier: id,
        password,
        deviceId: login.deviceId,
        userId: login.userId,
        deviceName: Platform.OS,
      });
      login = synced.login;
      device = synced.device;

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>🔒</Text>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Welcome back to VaultChat.</Text>

        <TextInput
          style={[styles.input, errors.identifier ? styles.inputError : null]}
          placeholder="Username or email"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={identifier}
          onChangeText={setIdentifier}
        />
        {errors.identifier ? <Text style={styles.errorText}>{errors.identifier}</Text> : null}

        <TextInput
          style={[styles.input, errors.password ? styles.inputError : null]}
          placeholder="Password"
          placeholderTextColor={theme.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
        {errors.form ? <Text style={styles.errorText}>{errors.form}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => void handleLogin()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  inner: { flex: 1, justifyContent: "center", padding: 24 },
  logo: { fontSize: 48, textAlign: "center", marginBottom: 8 },
  title: { fontSize: 28, fontWeight: "700", color: theme.text, textAlign: "center" },
  subtitle: { fontSize: 15, color: theme.textMuted, textAlign: "center", marginBottom: 32 },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
    color: theme.text,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  inputError: { borderColor: theme.danger },
  errorText: { color: theme.danger, fontSize: 13, marginBottom: 8 },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
