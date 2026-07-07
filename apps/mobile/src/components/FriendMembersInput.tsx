import {
  appendMemberUsername,
  filterFriendsForMemberInput,
  type FriendPick,
} from "@vaultchat/client";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { theme } from "@/theme";

export function FriendMembersInput({
  friends,
  value,
  onChange,
  placeholder = "Add friends by username…",
  disabled,
}: {
  friends: FriendPick[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const suggestions = filterFriendsForMemberInput(friends, value);

  function pick(username: string) {
    onChange(appendMemberUsername(value, username));
  }

  return (
    <View style={styles.root}>
      <TextInput
        style={[styles.input, focused && styles.inputFocused]}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
      />
      {focused && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.map((f) => (
            <Pressable
              key={f.userId}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => pick(f.username)}
            >
              <Avatar name={f.username} size={32} />
              <Text style={styles.username}>@{f.username}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {focused && friends.length === 0 && (
        <Text style={styles.hint}>Add friends first to invite them to a group.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "relative", zIndex: 1 },
  input: {
    backgroundColor: theme.bgInput,
    borderRadius: theme.radius.sm,
    color: theme.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSize.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputFocused: {
    borderColor: theme.borderFocus,
  },
  dropdown: {
    marginTop: theme.spacing.xs,
    backgroundColor: theme.bgElevated,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  itemPressed: { backgroundColor: theme.accentMuted },
  username: { color: theme.textPrimary, fontSize: theme.fontSize.md },
  hint: {
    marginTop: theme.spacing.xs,
    color: theme.textMuted,
    fontSize: theme.fontSize.sm,
  },
});
