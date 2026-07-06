import { arrayBufferToBase64 } from "@vaultchat/crypto";
import { downloadEncryptedMedia } from "@vaultchat/client";
import type { MessageContent } from "@vaultchat/protocol";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

interface MediaBubbleProps {
  token: string;
  media: NonNullable<MessageContent["media"]>;
}

export function MediaBubble({ token, media }: MediaBubbleProps) {
  const [uri, setUri] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bytes = await downloadEncryptedMedia(token, media);
        if (cancelled) return;
        if (media.mime.startsWith("image/") && bytes.byteLength <= 4 * 1024 * 1024) {
          setUri(`data:${media.mime};base64,${arrayBufferToBase64(bytes)}`);
        } else {
          setLabel(media.mime.startsWith("video/") ? "🎬 Encrypted video" : "📎 Encrypted file");
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, media.mediaId, media.mime, media.key, media.nonce]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={theme.accent} />
      </View>
    );
  }
  if (error) return <Text style={styles.text}>🔒 Unable to load media</Text>;
  if (uri) return <Image source={{ uri }} style={styles.image} />;
  return <Text style={styles.text}>{label ?? "📎 Encrypted attachment"}</Text>;
}

const styles = StyleSheet.create({
  image: { width: 200, height: 200, borderRadius: 6, marginBottom: 4 },
  text: { color: theme.textPrimary },
  loading: { paddingVertical: 8 },
});
