import { clampMessageText, MAX_MESSAGE_TEXT_LENGTH } from "@vaultchat/client";
import { useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { theme } from "@/theme";
import { IconSend } from "@/components/icons/CommunityIcons";
import { MarkdownText } from "@/components/MarkdownText";
import { messageHasMarkdownPreview } from "@/lib/messageMarkdown";

const INPUT_MIN_HEIGHT = 44;
const INPUT_MAX_HEIGHT = 120;
const INPUT_LINE_HEIGHT = 22;

interface ChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  placeholder?: string;
  editable?: boolean;
  sending?: boolean;
  attachDisabled?: boolean;
  sendDisabled?: boolean;
}

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onAttach,
  placeholder = "Message",
  editable = true,
  sending = false,
  attachDisabled = false,
  sendDisabled = false,
}: ChatComposerProps) {
  const inputRef = useRef<TextInput>(null);
  const canSend = value.trim().length > 0 && !sending && !sendDisabled;
  const isEditable = editable && !sending;
  const showPreview = messageHasMarkdownPreview(value);

  return (
    <View style={styles.composer}>
      {onAttach ? (
        <Pressable
          style={[styles.attachBtn, attachDisabled && styles.btnDisabled]}
          onPress={onAttach}
          disabled={attachDisabled || sending}
          hitSlop={8}
        >
          <Text style={styles.attachBtnText}>📎</Text>
        </Pressable>
      ) : null}

      <View style={[styles.inputWrap, showPreview && styles.inputWrapPreview]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          value={value}
          onChangeText={(text) => onChangeText(clampMessageText(text))}
          maxLength={MAX_MESSAGE_TEXT_LENGTH}
          multiline
          scrollEnabled
          blurOnSubmit={false}
          returnKeyType="default"
          editable={isEditable}
          showSoftInputOnFocus
          caretHidden={false}
          textAlignVertical="top"
          keyboardType="default"
          autoCorrect
          autoCapitalize="sentences"
        />
        {showPreview ? (
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>Preview</Text>
            <MarkdownText text={value} style={styles.previewBody} />
          </View>
        ) : null}
      </View>

      <Pressable
        style={[styles.sendBtn, !canSend && styles.btnDisabled]}
        onPress={() => {
          if (!canSend) return;
          onSend();
        }}
        disabled={!canSend}
        hitSlop={8}
      >
        {sending ? (
          <ActivityIndicator size="small" color={theme.bgApp} />
        ) : (
          <IconSend size={20} color={theme.bgApp} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.bgHeader,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  attachBtn: {
    width: 44,
    height: INPUT_MIN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgElevated,
    borderRadius: theme.radius.full,
  },
  attachBtnText: { fontSize: 18 },
  inputWrap: {
    flex: 1,
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT + 80,
    backgroundColor: theme.bgInput,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
  },
  inputWrapPreview: {
    maxHeight: INPUT_MAX_HEIGHT + 120,
  },
  input: {
    width: "100%",
    color: theme.textPrimary,
    fontSize: theme.fontSize.lg,
    lineHeight: INPUT_LINE_HEIGHT,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: Platform.OS === "ios" ? 11 : 10,
    paddingBottom: Platform.OS === "ios" ? 11 : 10,
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  preview: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  previewLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: theme.spacing.xs,
  },
  previewBody: {},
  sendBtn: {
    width: 44,
    height: INPUT_MIN_HEIGHT,
    borderRadius: theme.radius.full,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { color: theme.bgApp, fontSize: 18 },
  btnDisabled: { opacity: 0.5 },
});
