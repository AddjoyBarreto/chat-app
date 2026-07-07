import { VaultDevice } from "@vaultchat/crypto";
import {
  DEFAULT_PHONE_COUNTRY,
  hasFieldErrors,
  mergeAndUploadAccountBackup,
  mapRegistrationError,
  normalizeRegistrationFields,
  persistDevice,
  registerOnServer,
  saveSession,
  uploadPreKeys,
  validateEmail,
  validatePassword,
  validatePhone,
  validateRegistrationFields,
  validateUsername,
  type RegistrationFieldErrors,
  type RegistrationFields,
} from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity } from "react-native";
import { PhoneField } from "@/components/PhoneField";
import { AuthScreen } from "@/components/ui/AuthScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useApp, storage } from "@/context/AppContext";
import { theme } from "@/theme";

type TouchedFields = Partial<Record<keyof RegistrationFields, boolean>>;

function fieldError(
  key: keyof RegistrationFields,
  fields: RegistrationFields
): string | undefined {
  switch (key) {
    case "username": {
      const err = validateUsername(fields.username);
      return err ?? undefined;
    }
    case "email": {
      const err = validateEmail(fields.email);
      return err ?? undefined;
    }
    case "password": {
      const err = validatePassword(fields.password);
      return err ?? undefined;
    }
    case "phoneNumber": {
      const err = validatePhone(fields.phoneCountry, fields.phoneNumber);
      return err ?? undefined;
    }
    default:
      return undefined;
  }
}

function isFieldValid(key: keyof RegistrationFields, fields: RegistrationFields): boolean {
  const value = fields[key];
  if (!value && key !== "phoneNumber") return false;
  return !fieldError(key, fields);
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
  const [touched, setTouched] = useState<TouchedFields>({});
  const [loading, setLoading] = useState(false);

  const touch = useCallback((key: keyof RegistrationFields) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }, []);

  const showError = useCallback(
    (key: keyof RegistrationFields) => {
      if (!touched[key] && !errors[key]) return undefined;
      return errors[key] ?? (touched[key] ? fieldError(key, fields) : undefined);
    },
    [touched, errors, fields]
  );

  const showValid = useCallback(
    (key: keyof RegistrationFields) => touched[key] && isFieldValid(key, fields),
    [touched, fields]
  );

  const passwordHint = useMemo(() => {
    if (!fields.password || showValid("password")) return undefined;
    const remaining = 8 - fields.password.length;
    if (remaining > 0) return `${remaining} more character${remaining === 1 ? "" : "s"} needed`;
    return undefined;
  }, [fields.password, showValid]);

  if (session) {
    if (session.emailVerified === false) return <Redirect href="/verify-email" />;
    return <Redirect href="/chats" />;
  }

  function updateField<K extends keyof RegistrationFields>(key: K, value: RegistrationFields[K]) {
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      setErrors((prevErrors) => {
        const nextErrors = { ...prevErrors };
        delete nextErrors[key];
        delete nextErrors.form;
        if (key === "phoneCountry" || key === "phoneNumber") delete nextErrors.phoneNumber;
        return nextErrors;
      });
      return next;
    });
  }

  function handleBlur(key: keyof RegistrationFields) {
    touch(key);
    const err = fieldError(key, fields);
    if (key === "phoneCountry" || key === "phoneNumber") {
      const phoneErr = fieldError("phoneNumber", fields);
      setErrors((prev) => {
        const next = { ...prev };
        if (phoneErr) next.phoneNumber = phoneErr;
        else delete next.phoneNumber;
        return next;
      });
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[key] = err;
      else delete next[key];
      return next;
    });
  }

  async function handleRegister() {
    setTouched({
      username: true,
      email: true,
      password: true,
      phoneCountry: true,
      phoneNumber: true,
    });

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

      const linked = await VaultDevice.restore(reg.userId, reg.deviceId, device.exportState());

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
      await persistDevice(storage, linked, reg.userId);
      try {
        await mergeAndUploadAccountBackup(reg.token, normalized.password, linked);
      } catch {
        // non-fatal
      }
      setDevice(linked);
      setSession(stored);
      router.replace("/verify-email");
    } catch (e) {
      setErrors(mapRegistrationError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen
      scroll
      title="Create account"
      subtitle="Encryption keys are generated on this device only — never on our servers."
      footer={
        <TouchableOpacity onPress={() => router.push("/login")} disabled={loading}>
          <Text style={styles.footerText}>
            Already have an account? <Text style={styles.footerLink}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      }
    >
      <Input
        placeholder="Username"
        value={fields.username}
        onChangeText={(v) => updateField("username", v)}
        onBlur={() => handleBlur("username")}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={32}
        editable={!loading}
        error={showError("username")}
        valid={showValid("username")}
      />

      <Input
        placeholder="Email"
        value={fields.email}
        onChangeText={(v) => updateField("email", v)}
        onBlur={() => handleBlur("email")}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!loading}
        error={showError("email")}
        valid={showValid("email")}
      />

      <Input
        placeholder="Password (8+ characters)"
        value={fields.password}
        onChangeText={(v) => updateField("password", v)}
        onBlur={() => handleBlur("password")}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!loading}
        error={showError("password")}
        valid={showValid("password")}
        hint={passwordHint}
      />

      <PhoneField
        country={fields.phoneCountry}
        phoneNumber={fields.phoneNumber}
        onCountryChange={(iso) => {
          updateField("phoneCountry", iso);
          if (touched.phoneNumber) {
            const phoneErr = validatePhone(iso, fields.phoneNumber);
            setErrors((prev) => {
              const next = { ...prev };
              if (phoneErr) next.phoneNumber = phoneErr;
              else delete next.phoneNumber;
              return next;
            });
          }
        }}
        onPhoneChange={(v) => updateField("phoneNumber", v)}
        onBlur={() => handleBlur("phoneNumber")}
        error={showError("phoneNumber")}
        valid={showValid("phoneNumber")}
        disabled={loading}
      />

      {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

      <Button
        title="Create account"
        onPress={() => void handleRegister()}
        loading={loading}
        style={styles.submit}
      />
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
