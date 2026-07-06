import { registerPushToken } from "@vaultchat/client";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function setupPushNotifications(authToken: string): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const platform = Platform.OS === "ios" ? "ios" : "android";
    await registerPushToken(authToken, tokenData.data, platform);
  } catch {
    // Push token registration is optional (simulator, Expo Go limits, missing EAS project).
  }
}
