import { fetchMe, friendlyError, resendVerificationEmail } from "@vaultchat/client";
import type { MeResponse } from "@vaultchat/protocol";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/context/AppContext";
import { theme } from "@/theme";

function formatPhone(code: string, number: string): string {
  return `${code} ${number}`;
}

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { session } = useApp();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setMe(await fetchMe(session.token));
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) return <Redirect href="/register" />;

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

  return (
    <View style={styles.container}>
      <ScreenHeader title="Profile" subtitle="Your account" />

      {loading ? (
        <ActivityIndicator color={theme.accent} style={styles.spinner} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={theme.accent}
            />
          }
        >
          <View style={styles.hero}>
            <Avatar name={me?.username ?? session.username} size={80} />
            <Text style={styles.username}>@{me?.username ?? session.username}</Text>
            <View style={styles.encryptionBadge}>
              <Text style={styles.encryptionText}>🔒 Keys on this device only</Text>
            </View>
          </View>

          <Card style={styles.card}>
            <InfoRow label="Email" value={me?.email ?? "—"} />
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email status</Text>
              <Text
                style={[
                  styles.infoValue,
                  me?.emailVerified ? styles.verified : styles.unverified,
                ]}
              >
                {me?.emailVerified ? "Verified" : "Not verified"}
              </Text>
            </View>
            {!me?.emailVerified && (
              <>
                <View style={styles.divider} />
                <Button
                  title="Resend verification email"
                  variant="secondary"
                  onPress={() => void handleResend()}
                  loading={resending}
                />
              </>
            )}
            <View style={styles.divider} />
            <InfoRow
              label="Phone"
              value={me ? formatPhone(me.phoneCountryCode, me.phoneNumber) : "—"}
            />
            <View style={styles.divider} />
            <InfoRow
              label="Member since"
              value={me ? formatMemberSince(me.createdAt) : "—"}
            />
          </Card>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Text style={styles.footerNote}>
            VaultChat never has access to your private keys or message contents.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgApp },
  spinner: { marginTop: theme.spacing.xxl },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  hero: { alignItems: "center", marginBottom: theme.spacing.xl },
  username: {
    color: theme.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: "700",
    marginTop: theme.spacing.md,
  },
  encryptionBadge: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.accentMuted,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
  },
  encryptionText: { color: theme.accent, fontSize: theme.fontSize.sm, fontWeight: "600" },
  card: { marginBottom: theme.spacing.lg },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  infoLabel: { color: theme.textSecondary, fontSize: theme.fontSize.md },
  infoValue: {
    color: theme.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
  },
  verified: { color: theme.online },
  unverified: { color: theme.warning },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.border,
    marginVertical: theme.spacing.md,
  },
  message: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.md,
    textAlign: "center",
  },
  footerNote: {
    color: theme.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    lineHeight: 18,
  },
});
