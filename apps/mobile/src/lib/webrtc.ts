import Constants from "expo-constants";
import type { WebRtcAdapter } from "@vaultchat/client";
import { PermissionsAndroid, Platform } from "react-native";

let adapter: WebRtcAdapter | undefined;
let checked = false;

export function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

async function ensureCallPermissions(video: boolean): Promise<void> {
  if (Platform.OS !== "android") return;

  const permissions = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ...(video ? [PermissionsAndroid.PERMISSIONS.CAMERA] : []),
  ];

  const results = await PermissionsAndroid.requestMultiple(permissions);
  const denied = permissions.some((p) => results[p] !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied) {
    const err = new Error("Microphone or camera permission denied");
    err.name = "NotAllowedError";
    throw err;
  }
}

function loadAdapter(): WebRtcAdapter | undefined {
  if (checked) return adapter;
  checked = true;

  // Never load react-native-webrtc in Expo Go — it throws Invariant Violation on import.
  if (isExpoGo()) {
    adapter = undefined;
    return adapter;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require("react-native-webrtc") as {
      RTCPeerConnection: typeof RTCPeerConnection;
      mediaDevices: { getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream> };
    };
    adapter = {
      RTCPeerConnection: rn.RTCPeerConnection,
      getUserMedia: async (constraints) => {
        const wantsVideo = Boolean(
          constraints.video === true ||
            (typeof constraints.video === "object" && constraints.video !== null)
        );
        await ensureCallPermissions(wantsVideo);
        return rn.mediaDevices.getUserMedia(constraints);
      },
    };
  } catch {
    adapter = undefined;
  }
  return adapter;
}

export function getWebRtcAdapter(): WebRtcAdapter | undefined {
  return loadAdapter();
}

export function callsSupported(): boolean {
  return loadAdapter() !== undefined;
}
