import { ReactNode, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const HEADER_HEIGHT = 44;

interface ChatScreenLayoutProps {
  list: ReactNode;
  composer: ReactNode;
}

export function ChatScreenLayout({ list, composer }: ChatScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const [composerHeight, setComposerHeight] = useState(72);

  function onComposerLayout(e: LayoutChangeEvent) {
    setComposerHeight(e.nativeEvent.layout.height);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + HEADER_HEIGHT : 0}
      >
        <View style={styles.flex}>
          <View style={[styles.list, { marginBottom: composerHeight }]}>{list}</View>
          <View style={styles.composerDock} onLayout={onComposerLayout} pointerEvents="box-none">
            {composer}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  list: { ...StyleSheet.absoluteFillObject },
  composerDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
});
