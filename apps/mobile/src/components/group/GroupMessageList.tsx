import type { MessageContent } from "@vaultchat/protocol";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { MediaBubble } from "@/components/MediaBubble";
import { theme } from "@/theme";

export interface GroupMessageItem {
  id: string;
  username: string;
  text: string;
  content: MessageContent;
  from: "me" | "them";
  time: string;
  failed?: boolean;
}

interface GroupMessageListProps {
  messages: GroupMessageItem[];
  channelName: string;
  token: string;
  hasKey: boolean;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function GroupMessageList({ messages, channelName, token, hasKey }: GroupMessageListProps) {
  return (
    <FlatList
      data={messages}
      keyExtractor={(m) => m.id}
      style={styles.list}
      contentContainerStyle={messages.length === 0 ? styles.listEmpty : styles.listContent}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="interactive"
      ListEmptyComponent={
        <View style={styles.welcome}>
          <View style={styles.welcomeIcon}>
            <Text style={styles.welcomeHash}>#</Text>
          </View>
          <Text style={styles.welcomeTitle}>Welcome to #{channelName}!</Text>
          <Text style={styles.welcomeText}>
            This is the start of the #{channelName} channel.
            {hasKey ? " Send a message to get the conversation going." : ""}
          </Text>
          <Text style={styles.welcomeHint}>🔒 Messages are end-to-end encrypted</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.messageRow}>
          <Avatar name={item.username} size={40} />
          <View style={styles.messageBody}>
            <View style={styles.messageMeta}>
              <Text style={styles.author}>{item.username}</Text>
              <Text style={styles.time}>{formatTime(item.time)}</Text>
            </View>
            {item.failed ? (
              <Text style={[styles.messageText, styles.failed]}>{item.text}</Text>
            ) : (
              <>
                {item.content.type === "image" && item.content.image && (
                  <Image
                    source={{
                      uri: `data:${item.content.image.mime};base64,${item.content.image.data}`,
                    }}
                    style={styles.image}
                  />
                )}
                {item.content.type === "media" && item.content.media && (
                  <MediaBubble token={token} media={item.content.media} />
                )}
                {item.content.text ? (
                  <Text style={styles.messageText}>{item.content.text}</Text>
                ) : null}
              </>
            )}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: theme.bgApp },
  listContent: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md },
  listEmpty: { flexGrow: 1 },
  welcome: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  welcomeIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: theme.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.lg,
  },
  welcomeHash: { color: theme.textMuted, fontSize: 32, fontWeight: "300" },
  welcomeTitle: {
    color: theme.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: "700",
    marginBottom: theme.spacing.sm,
  },
  welcomeText: { color: theme.textSecondary, fontSize: theme.fontSize.md, lineHeight: 22 },
  welcomeHint: { color: theme.textMuted, fontSize: theme.fontSize.sm, marginTop: theme.spacing.lg },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  messageBody: { flex: 1 },
  messageMeta: { flexDirection: "row", alignItems: "baseline", gap: theme.spacing.sm, marginBottom: 2 },
  author: { color: theme.textPrimary, fontSize: theme.fontSize.md, fontWeight: "700" },
  time: { color: theme.textMuted, fontSize: theme.fontSize.xs },
  messageText: { color: theme.textPrimary, fontSize: theme.fontSize.md, lineHeight: 22 },
  failed: { color: theme.danger, fontStyle: "italic" },
  image: { width: 220, height: 220, borderRadius: theme.radius.sm, marginTop: 4 },
});
