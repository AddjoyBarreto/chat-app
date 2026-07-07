import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "@/context/AppContext";
import { CallProvider } from "@/context/CallContext";
import { FriendsProvider } from "@/context/FriendsContext";
import { bootstrapClient } from "@/lib/bootstrap";
import { theme } from "@/theme";

bootstrapClient();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProvider>
          <FriendsProvider>
            <CallProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: theme.bgHeader },
                  headerTintColor: theme.textPrimary,
                  headerTitleStyle: { fontWeight: "600", fontSize: 17 },
                  headerShadowVisible: false,
                  contentStyle: { backgroundColor: theme.bgApp },
                  headerBackTitle: "Back",
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="register" options={{ headerShown: false }} />
                <Stack.Screen name="verify-email" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="friends" options={{ title: "Friends" }} />
                <Stack.Screen name="groups" options={{ title: "Communities" }} />
                <Stack.Screen name="devices" options={{ title: "Linked devices" }} />
                <Stack.Screen
                  name="conversation/[peerId]"
                  options={{ title: "Chat", keyboardHandlingEnabled: true }}
                />
                <Stack.Screen
                  name="group/[groupId]"
                  options={{ headerShown: false, keyboardHandlingEnabled: true }}
                />
              </Stack>
            </CallProvider>
          </FriendsProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
