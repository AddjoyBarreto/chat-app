import {
  fetchBlocks,
  fetchMyDevices,
  fetchPrivacySettings,
  friendlyError,
  updatePrivacySettings,
  type DmPolicy,
} from "@vaultchat/client";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MenuRow, MenuSection } from "@/components/ui/MenuRow";
import { PresenceStatusPicker } from "@/components/PresenceStatusPicker";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useApp } from "@/context/AppContext";
import { useFriendsContext } from "@/context/FriendsContext";
import { theme } from "@/theme";

const DM_OPTIONS: { value: DmPolicy; label: string; description: string }[] = [
  { value: "everyone", label: "Everyone", description: "Anyone can message you" },
  {
    value: "friends_only",
    label: "Friends only",
    description: "Only accepted friends can DM you",
  },
];

export default function OtherScreen() {
  const { session, logout, connectionState } = useApp();
  const friends = useFriendsContext();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dmPolicy, setDmPolicy] = useState<DmPolicy>("everyone");
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [blockCount, setBlockCount] = useState(0);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [privacy, devices, blocks] = await Promise.all([
        fetchPrivacySettings(session.token),
        fetchMyDevices(session.token),
        fetchBlocks(session.token),
      ]);
      setDmPolicy(privacy.dmPolicy);
      setDeviceCount(devices.devices.length);
      setBlockCount(blocks.blocks.length);
    } catch {
      // non-fatal for menu screen
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) return <Redirect href="/register" />;

  async function handleDmPolicy(policy: DmPolicy) {
    if (!session || policy === dmPolicy) return;
    setSavingPrivacy(true);
    try {
      const updated = await updatePrivacySettings(session.token, { dmPolicy: policy });
      setDmPolicy(updated.dmPolicy);
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setSavingPrivacy(false);
    }
  }

  function confirmLogout() {
    Alert.alert("Log out?", "You'll need to sign in again on this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void logout() },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Other" subtitle="Settings & more" />

      {loading ? (
        <ActivityIndicator color={theme.accent} style={styles.spinner} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <MenuSection title="Social">
            <MenuRow
              icon="👥"
              label="Friends"
              description="Manage friend requests"
              onPress={() => router.push("/friends")}
            />
            <MenuRow
              icon="🏘️"
              label="Communities"
              description="Groups and invite codes"
              onPress={() => router.push("/groups")}
            />
          </MenuSection>

          <MenuSection title="Privacy">
            <View style={styles.privacyBox}>
              <Text style={styles.privacyTitle}>Who can message you</Text>
              {DM_OPTIONS.map((opt) => {
                const selected = dmPolicy === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.privacyOption, selected && styles.privacyOptionSelected]}
                    onPress={() => void handleDmPolicy(opt.value)}
                    disabled={savingPrivacy}
                  >
                    <View style={styles.radioOuter}>
                      {selected ? <View style={styles.radioInner} /> : null}
                    </View>
                    <View style={styles.privacyText}>
                      <Text style={styles.privacyLabel}>{opt.label}</Text>
                      <Text style={styles.privacyDesc}>{opt.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <MenuRow
              icon="🚫"
              label="Blocked users"
              description={`${blockCount} blocked`}
              onPress={() => Alert.alert("Blocked users", `${blockCount} user(s) blocked. Manage on web for now.`)}
            />
          </MenuSection>

          <MenuSection title="Account">
            <View style={styles.presenceBox}>
              <Text style={styles.privacyTitle}>Your status</Text>
              <PresenceStatusPicker
                value={friends.ownPresence}
                onChange={friends.setPresence}
                disabled={connectionState !== "connected"}
              />
            </View>
            <MenuRow
              icon="📱"
              label="Devices"
              description={`${deviceCount} linked device${deviceCount === 1 ? "" : "s"}`}
              onPress={() => router.push("/devices")}
            />
            <MenuRow icon="🔒" label="Encryption" description="Keys stay on this device" onPress={() =>
              Alert.alert(
                "End-to-end encryption",
                "VaultChat generates encryption keys on your device. Messages are encrypted before they leave your phone."
              )
            } />
          </MenuSection>

          <MenuSection title="App">
            <MenuRow
              icon="ℹ️"
              label="About VaultChat"
              description="Version 0.0.1"
              onPress={() =>
                Alert.alert(
                  "VaultChat",
                  "End-to-end encrypted messaging. Your keys never leave this device."
                )
              }
            />
            <MenuRow icon="🚪" label="Log out" onPress={confirmLogout} danger />
          </MenuSection>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgApp },
  spinner: { marginTop: theme.spacing.xxl },
  content: { paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  privacyBox: {
    backgroundColor: theme.bgElevated,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  presenceBox: {
    backgroundColor: theme.bgElevated,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  privacyTitle: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    marginBottom: theme.spacing.xs,
  },
  privacyOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  privacyOptionSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.accentMuted,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.accent,
  },
  privacyText: { flex: 1 },
  privacyLabel: { color: theme.textPrimary, fontSize: theme.fontSize.md, fontWeight: "600" },
  privacyDesc: { color: theme.textMuted, fontSize: theme.fontSize.sm, marginTop: 2 },
});
