import Constants from "expo-constants";
import type { WebRtcAdapter } from "@vaultchat/client";

let adapter: WebRtcAdapter | undefined;
let checked = false;

export function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
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
      getUserMedia: (constraints) => rn.mediaDevices.getUserMedia(constraints),
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
