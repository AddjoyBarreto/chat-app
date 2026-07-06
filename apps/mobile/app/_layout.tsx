import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider } from "@/context/AppContext";
import { CallProvider } from "@/context/CallContext";
import { bootstrapClient } from "@/lib/bootstrap";

bootstrapClient();

export default function RootLayout() {
  return (
    <AppProvider>
      <CallProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#202c33" },
          headerTintColor: "#e9edef",
          headerTitleStyle: { fontWeight: "500" },
          contentStyle: { backgroundColor: "#111b21" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="chats" options={{ title: "VaultChat" }} />
        <Stack.Screen name="friends" options={{ title: "Friends" }} />
        <Stack.Screen name="groups" options={{ title: "Communities" }} />
        <Stack.Screen name="conversation/[peerId]" options={{ title: "Chat" }} />
        <Stack.Screen name="group/[groupId]" options={{ title: "Group" }} />
      </Stack>
      </CallProvider>
    </AppProvider>
  );
}
