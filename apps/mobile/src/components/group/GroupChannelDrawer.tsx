import type { ChannelCategoryInfo, ChannelInfo } from "@vaultchat/protocol";
import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChannelTypeIcon,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconLock,
} from "@/components/icons/CommunityIcons";
import { theme } from "@/theme";

interface GroupChannelDrawerProps {
  visible: boolean;
  communityName: string;
  categories: ChannelCategoryInfo[];
  channels: ChannelInfo[];
  activeChannelId?: string;
  onClose: () => void;
  onBack: () => void;
  onSelectChannel: (channel: ChannelInfo) => void;
}

export function GroupChannelDrawer({
  visible,
  communityName,
  categories,
  channels,
  activeChannelId,
  onClose,
  onBack,
  onSelectChannel,
}: GroupChannelDrawerProps) {
  const insets = useSafeAreaInsets();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const uncategorized = channels.filter((c) => !c.categoryId);
  const byCategory = new Map<string, ChannelInfo[]>();
  for (const ch of channels) {
    if (!ch.categoryId) continue;
    const list = byCategory.get(ch.categoryId) ?? [];
    list.push(ch);
    byCategory.set(ch.categoryId, list);
  }

  function renderChannel(ch: ChannelInfo) {
    const active = activeChannelId === ch.id;
    return (
      <Pressable
        key={ch.id}
        style={[styles.channelRow, active && styles.channelRowActive]}
        onPress={() => {
          onSelectChannel(ch);
          onClose();
        }}
      >
        <View style={styles.channelIcon}>
          <ChannelTypeIcon
            type={ch.type}
            size={18}
            color={active ? theme.textPrimary : theme.textMuted}
          />
        </View>
        <Text style={[styles.channelName, active && styles.channelNameActive]} numberOfLines={1}>
          {ch.name}
        </Text>
        {ch.isPrivate ? (
          <View style={styles.lock}>
            <IconLock size={12} />
          </View>
        ) : null}
      </Pressable>
    );
  }

  function renderCategory(cat: ChannelCategoryInfo) {
    const isCollapsed = collapsed[cat.id];
    const catChannels = byCategory.get(cat.id) ?? [];
    return (
      <View key={cat.id} style={styles.category}>
        <Pressable
          style={styles.categoryHeader}
          onPress={() => setCollapsed((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
        >
          <View style={styles.categoryChevron}>
            {isCollapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
          </View>
          <Text style={styles.categoryName}>{cat.name.toUpperCase()}</Text>
        </Pressable>
        {!isCollapsed && catChannels.map(renderChannel)}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.drawer, { paddingTop: insets.top }]}>
          <Pressable style={styles.backRow} onPress={() => { onClose(); onBack(); }}>
            <IconChevronLeft size={24} />
            <Text style={styles.backLabel}>Communities</Text>
          </Pressable>
          <View style={styles.serverHeader}>
            <Text style={styles.serverName} numberOfLines={1}>
              {communityName}
            </Text>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {categories.map(renderCategory)}
            {uncategorized.length > 0 && (
              <View style={styles.category}>
                <Text style={styles.categoryName}>CHANNELS</Text>
                {uncategorized.map(renderChannel)}
              </View>
            )}
          </ScrollView>
        </View>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close channels" />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row", backgroundColor: theme.overlay },
  drawer: {
    width: "86%",
    maxWidth: 320,
    backgroundColor: theme.bgPanel,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.border,
  },
  dismiss: { flex: 1 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 2,
  },
  backLabel: { color: theme.textPrimary, fontSize: theme.fontSize.md, fontWeight: "500" },
  serverHeader: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  serverName: {
    color: theme.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: "700",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: theme.spacing.xl },
  category: { marginTop: theme.spacing.md },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: 4,
  },
  categoryChevron: { width: 14, alignItems: "center" },
  categoryName: {
    color: theme.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  channelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 10,
    borderRadius: theme.radius.sm,
    gap: 8,
  },
  channelRowActive: { backgroundColor: theme.accentMuted },
  channelIcon: { width: 20, alignItems: "center" },
  channelName: {
    flex: 1,
    color: theme.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: "500",
  },
  channelNameActive: { color: theme.textPrimary },
  lock: { opacity: 0.85 },
});
