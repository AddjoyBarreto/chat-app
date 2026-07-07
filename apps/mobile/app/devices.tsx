import {
  describeDevice,
  fetchMyDevices,
  friendlyError,
  getDeviceIcon,
  getDeviceTitle,
  inferDeviceKind,
} from "@vaultchat/client";
import type { ListDevicesResponse } from "@vaultchat/protocol";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/context/AppContext";
import { theme } from "@/theme";

export default function DevicesScreen() {
  const { session } = useApp();
  const [devices, setDevices] = useState<ListDevicesResponse["devices"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMyDevices(session.token);
      setDevices(res.devices);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) return <Redirect href="/register" />;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Linked devices"
        subtitle="Each install has its own encryption keys"
      />

      {loading ? (
        <ActivityIndicator color={theme.accent} style={styles.spinner} />
      ) : error ? (
        <Card style={styles.card}>
          <Text style={styles.error}>{error}</Text>
        </Card>
      ) : devices.length === 0 ? (
        <Card style={styles.card}>
          <Text style={styles.empty}>No linked devices found.</Text>
        </Card>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {devices.map((d) => {
            const kind = inferDeviceKind(d.deviceName);
            const isCurrent = d.deviceId === session.deviceId;
            return (
              <Card
                key={d.deviceId}
                style={[styles.deviceCard, isCurrent && styles.deviceCardCurrent]}
              >
                <View style={styles.deviceRow}>
                  <Text style={styles.icon}>{getDeviceIcon(kind)}</Text>
                  <View style={styles.deviceBody}>
                    <View style={styles.titleRow}>
                      <Text style={styles.deviceTitle}>{getDeviceTitle(d)}</Text>
                      {isCurrent && <Text style={styles.currentBadge}>This device</Text>}
                    </View>
                    <Text style={styles.deviceMeta}>{describeDevice(d)}</Text>
                  </View>
                </View>
              </Card>
            );
          })}
          <Text style={styles.note}>
            Remote logout for other devices is coming soon. Logging out removes keys from this
            device only.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgApp },
  spinner: { marginTop: theme.spacing.xxl },
  list: { padding: theme.spacing.lg, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
  card: { margin: theme.spacing.lg },
  error: { color: theme.danger, fontSize: theme.fontSize.md },
  empty: { color: theme.textSecondary, fontSize: theme.fontSize.md },
  deviceCard: { padding: theme.spacing.lg },
  deviceCardCurrent: {
    borderWidth: 1,
    borderColor: theme.accent,
    backgroundColor: theme.accentMuted,
  },
  deviceRow: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.md },
  icon: { fontSize: 28, lineHeight: 32 },
  deviceBody: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  deviceTitle: {
    color: theme.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: "600",
  },
  currentBadge: {
    color: theme.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  deviceMeta: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.xs,
    lineHeight: 18,
  },
  note: {
    color: theme.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
  },
});
