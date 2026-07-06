import { VaultDevice } from "@vaultchat/crypto";
import {
  DEFAULT_PHONE_COUNTRY,
  friendlyError,
  hasFieldErrors,
  mapRegistrationError,
  normalizeRegistrationFields,
  persistDevice,
  registerOnServer,
  saveSession,
  uploadPreKeys,
  validateRegistrationFields,
  type RegistrationFieldErrors,
  type RegistrationFields,
} from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CountryPicker } from "@/components/CountryPicker";
import { useApp, storage } from "@/context/AppContext";
import { theme } from "@/theme";

function fieldStyle(hasError: boolean) {
  return [styles.input, hasError ? styles.inputError : null];
}

export default function RegisterScreen() {
  const { session, setSession, setDevice } = useApp();
  const router = useRouter();
  const [fields, setFields] = useState<RegistrationFields>({
    username: "",
    email: "",
    password: "",
    phoneCountry: DEFAULT_PHONE_COUNTRY,
    phoneNumber: "",
  });
  const [errors, setErrors] = useState<RegistrationFieldErrors>({});
  const [loading, setLoading] = useState(false);

  if (session) {
    if (session.emailVerified === false) return <Redirect href="/verify-email" />;
    return <Redirect href="/chats" />;
  }

  function updateField<K extends keyof RegistrationFields>(key: K, value: RegistrationFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      delete next.form;
      if (key === "phoneCountry" || key === "phoneNumber") delete next.phoneNumber;
      return next;
    });
  }

  async function handleRegister() {
    const validation = validateRegistrationFields(fields);
    if (hasFieldErrors(validation)) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      const normalized = normalizeRegistrationFields(fields);
      const device = await VaultDevice.create(normalized.username);
      const material = await device.exportKeyMaterial();

      const reg = await registerOnServer({
        username: normalized.username,
        email: normalized.email,
        password: normalized.password,
        phoneCountryCode: normalized.phoneCountryCode,
        phoneNumber: normalized.phoneNumber,
        identityKeyPublic: material.identityKeyPublic,
        registrationId: material.registrationId,
        deviceName: Platform.OS,
      });

      await uploadPreKeys(reg.token, {
        signedPreKey: material.signedPreKey,
        oneTimePreKeys: material.oneTimePreKeys,
      });

      const stored = {
        username: normalized.username,
        userId: reg.userId,
        token: reg.token,
        deviceId: reg.deviceId,
        emailVerified: reg.emailVerified,
      };

      await saveSession(storage, stored);
      await persistDevice(storage, device, reg.userId);
      setDevice(device);
      setSession(stored);
      router.replace("/verify-email");
    } catch (e) {
      setErrors(mapRegistrationError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>🔒</Text>
        <Text style={styles.title}>VaultChat</Text>
        <Text style={styles.subtitle}>
          Create your encrypted account. Keys are generated on this device only.
        </Text>

        <View style={styles.field}>
          <TextInput
            style={fieldStyle(!!errors.username)}
            placeholder="Username"
            placeholderTextColor={theme.textMuted}
            value={fields.username}
            onChangeText={(v) => updateField("username", v)}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={32}
            editable={!loading}
          />
          {errors.username && <Text style={styles.fieldError}>{errors.username}</Text>}
        </View>

        <View style={styles.field}>
          <TextInput
            style={fieldStyle(!!errors.email)}
            placeholder="Email"
            placeholderTextColor={theme.textMuted}
            value={fields.email}
            onChangeText={(v) => updateField("email", v)}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />
          {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
        </View>

        <View style={styles.field}>
          <TextInput
            style={fieldStyle(!!errors.password)}
            placeholder="Password (8+ characters)"
            placeholderTextColor={theme.textMuted}
            value={fields.password}
            onChangeText={(v) => updateField("password", v)}
            secureTextEntry
            editable={!loading}
          />
          {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
        </View>

        <View style={styles.field}>
          <View style={styles.phoneRow}>
            <CountryPicker
              value={fields.phoneCountry}
              onChange={(iso) => updateField("phoneCountry", iso)}
              disabled={loading}
              hasError={!!errors.phoneNumber}
            />
            <TextInput
              style={[styles.input, styles.phoneInput, errors.phoneNumber ? styles.inputError : null]}
              placeholder="Phone number"
              placeholderTextColor={theme.textMuted}
              value={fields.phoneNumber}
              onChangeText={(v) => updateField("phoneNumber", v)}
              keyboardType="phone-pad"
              editable={!loading}
            />
          </View>
          {errors.phoneNumber && <Text style={styles.fieldError}>{errors.phoneNumber}</Text>}
        </View>

        {errors.form && <Text style={styles.fieldError}>{errors.form}</Text>}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={() => void handleRegister()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.bgApp} />
          ) : (
            <Text style={styles.btnText}>Create account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={() => router.push("/login")} disabled={loading}>
          <Text style={styles.linkText}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgApp },
  inner: { flexGrow: 1, justifyContent: "center", padding: 24, alignItems: "center" },
  logo: { fontSize: 64, marginBottom: 16 },
  title: { color: theme.textPrimary, fontSize: 28, fontWeight: "300", marginBottom: 8 },
  subtitle: {
    color: theme.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 300,
  },
  field: { width: "100%", maxWidth: 320, marginBottom: 8 },
  input: {
    width: "100%",
    backgroundColor: theme.bgInput,
    color: theme.textPrimary,
    padding: 14,
    borderRadius: 8,
    fontSize: 16,
  },
  phoneRow: { flexDirection: "row", gap: 8, width: "100%" },
  phoneInput: { flex: 1, minWidth: 0 },
  inputError: { borderWidth: 1, borderColor: theme.danger },
  fieldError: { color: theme.danger, fontSize: 13, marginTop: 4 },
  btn: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: theme.accent,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: theme.bgApp, fontWeight: "600", fontSize: 16 },
  linkBtn: { marginTop: 20 },
  linkText: { color: theme.accent, fontSize: 14 },
});
