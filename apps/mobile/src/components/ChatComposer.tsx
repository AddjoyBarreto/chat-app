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

      <View style={styles.inputWrap}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          value={value}
          onChangeText={onChangeText}
          multiline
          scrollEnabled
          blurOnSubmit={false}
          returnKeyType="default"
          editable={isEditable}
          showSoftInputOnFocus
          caretHidden={false}
          textAlignVertical="center"
          keyboardType="default"
          autoCorrect
          autoCapitalize="sentences"
        />
      </View>

      <Pressable
        style={[styles.sendBtn, !canSend && styles.btnDisabled]}
        onPress={onSend}
        disabled={!canSend}
        hitSlop={8}
      >
        {sending ? (
          <ActivityIndicator size="small" color={theme.bgApp} />
        ) : (
          <Text style={styles.sendBtnText}>➤</Text>
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
    maxHeight: INPUT_MAX_HEIGHT,
    backgroundColor: theme.bgInput,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: "center",
  },
  input: {
    flex: 1,
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
