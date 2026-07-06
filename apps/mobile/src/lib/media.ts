import { base64ToArrayBuffer } from "@vaultchat/crypto";
import { prepareMediaMessage } from "@vaultchat/client";
import * as ImagePicker from "expo-image-picker";

export async function pickAndPrepareMedia(
  token: string
): Promise<{ content: import("@vaultchat/protocol").MessageContent; messageType: import("@vaultchat/protocol").MessageType } | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library permission is required to send media.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: 1,
    base64: true,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0]!;
  const mime = asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");

  let bytes: ArrayBuffer;
  if (asset.base64) {
    bytes = base64ToArrayBuffer(asset.base64);
  } else if (asset.uri) {
    const res = await fetch(asset.uri);
    bytes = await res.arrayBuffer();
  } else {
    throw new Error("Could not read selected file.");
  }

  return prepareMediaMessage(token, bytes, mime);
}
