import { useCallSession } from "@vaultchat/chat-react";
import type { CallPhase } from "@vaultchat/client";
import type { CallType } from "@vaultchat/protocol";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Alert, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useApp } from "./AppContext";
import { callsSupported, getWebRtcAdapter } from "@/lib/webrtc";
import { theme } from "@/theme";

interface CallContextValue {
  callPhase: CallPhase;
  callType: CallType;
  callActive: boolean;
  canCall: boolean;
  activePeerUsername: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startOutgoing: (peerId: string, peerUsername: string, type: CallType) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => void;
  endCall: () => void;
  toggleMute: () => boolean;
}

const CallContext = createContext<CallContextValue | null>(null);

function isIncomingCallData(
  data: unknown
): data is { type: "incoming_call"; callId: string; callerId: string; callType: CallType } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: string }).type === "incoming_call" &&
    typeof (data as { callId?: string }).callId === "string" &&
    typeof (data as { callerId?: string }).callerId === "string"
  );
}

function getRtcView(): React.ComponentType<{
  streamURL: string;
  style?: object;
  objectFit?: "cover" | "contain";
  mirror?: boolean;
}> | null {
  if (!callsSupported()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RTCView } = require("react-native-webrtc") as {
      RTCView: React.ComponentType<{
        streamURL: string;
        style?: object;
        objectFit?: "cover" | "contain";
        mirror?: boolean;
      }>;
    };
    return RTCView;
  } catch {
    return null;
  }
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { session, connectionState, conversations, gatewaySend, onServerEventHandlers } =
    useApp();

  const [muted, setMuted] = useState(false);
  const [webrtcAvailable] = useState(() => callsSupported());
  const RTCView = getRtcView();

  const resolveUsername = useCallback(
    (userId: string) => {
      const conv = conversations.find((c) => c.peerId === userId);
      return conv?.peerUsername ?? userId.slice(0, 8);
    },
    [conversations]
  );

  const calls = useCallSession({
    session,
    send: gatewaySend,
    isConnected: connectionState === "connected",
    resolveUsername,
    onToast: (msg) => Alert.alert("Call", msg),
    webrtc: webrtcAvailable ? getWebRtcAdapter() : undefined,
  });

  useEffect(() => {
    const handler = calls.handleServerEvent;
    onServerEventHandlers.current.add(handler);
    return () => {
      onServerEventHandlers.current.delete(handler);
    };
  }, [calls.handleServerEvent, onServerEventHandlers]);

  const injectIncomingCall = useCallback(
    (callId: string, callerId: string, callType: CallType) => {
      calls.handleServerEvent({ type: "call_incoming", callId, callerId, callType });
    },
    [calls]
  );

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (!isIncomingCallData(data)) return;
      injectIncomingCall(data.callId, data.callerId, data.callType);
    });

    const response = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (!isIncomingCallData(data)) return;
      injectIncomingCall(data.callId, data.callerId, data.callType);
    });

    return () => {
      received.remove();
      response.remove();
    };
  }, [injectIncomingCall]);

  const activePeerUsername = calls.callPeer?.username ?? null;

  async function startOutgoing(peerId: string, peerUsername: string, type: CallType) {
    if (!webrtcAvailable) {
      Alert.alert(
        "Calls require dev build",
        "Voice and video calls need a custom Expo dev build with react-native-webrtc. They are not available in Expo Go."
      );
      return;
    }
    try {
      await calls.startOutgoing(peerId, type);
    } catch (e) {
      Alert.alert("Call failed", String(e));
    }
  }

  async function acceptIncoming() {
    if (!calls.incomingCall) return;
    const call = calls.incomingCall;
    try {
      await calls.acceptIncoming();
      router.push({
        pathname: "/conversation/[peerId]",
        params: { peerId: call.callerId, peerUsername: call.callerUsername },
      });
    } catch (e) {
      Alert.alert("Call failed", String(e));
    }
  }

  function toggleMute() {
    const enabled = calls.toggleMute();
    setMuted(!enabled);
    return enabled;
  }

  const remoteUrl =
    calls.remoteStream &&
    typeof (calls.remoteStream as MediaStream & { toURL?: () => string }).toURL === "function"
      ? (calls.remoteStream as MediaStream & { toURL: () => string }).toURL()
      : null;

  const localUrl =
    calls.localStream &&
    typeof (calls.localStream as MediaStream & { toURL?: () => string }).toURL === "function"
      ? (calls.localStream as MediaStream & { toURL: () => string }).toURL()
      : null;

  return (
    <CallContext.Provider
      value={{
        callPhase: calls.phase,
        callType: calls.callType,
        callActive: calls.inCall,
        canCall: webrtcAvailable && calls.canCall,
        activePeerUsername,
        localStream: calls.localStream,
        remoteStream: calls.remoteStream,
        startOutgoing,
        acceptIncoming,
        rejectIncoming: calls.rejectIncoming,
        endCall: calls.endCall,
        toggleMute,
      }}
    >
      {children}

      <Modal visible={!!calls.incomingCall} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Incoming call</Text>
            <Text style={styles.modalText}>
              @{calls.incomingCall?.callerUsername} —{" "}
              {calls.incomingCall?.callType === "video" ? "video" : "voice"}
            </Text>
            <View style={styles.callActions}>
              <TouchableOpacity style={styles.callReject} onPress={calls.rejectIncoming}>
                <Text style={styles.callBtnText}>✕</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.callAccept}
                onPress={() => void acceptIncoming()}
              >
                <Text style={styles.callBtnText}>
                  {calls.incomingCall?.callType === "video" ? "📹" : "📞"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={calls.inCall && calls.phase !== "incoming"}
        transparent
        animationType="slide"
      >
        <View style={styles.callOverlay}>
          {RTCView && remoteUrl && calls.callType === "video" ? (
            <RTCView streamURL={remoteUrl} style={styles.remoteVideo} objectFit="cover" />
          ) : null}

          {RTCView && remoteUrl && calls.callType !== "video" ? (
            <RTCView streamURL={remoteUrl} style={styles.hiddenRtc} objectFit="cover" />
          ) : null}

          {calls.callType === "video" && RTCView && localUrl ? (
            <RTCView
              streamURL={localUrl}
              style={styles.localVideo}
              objectFit="cover"
              mirror
            />
          ) : null}

          <View style={styles.callOverlayContent}>
            {calls.callType !== "video" && (
              <View style={styles.voiceAvatar}>
                <Text style={styles.voiceAvatarText}>
                  {activePeerUsername?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
            )}
            <Text style={styles.callName}>@{activePeerUsername}</Text>
            <Text style={styles.callStatus}>
              {calls.phase === "outgoing"
                ? "Calling…"
                : calls.phase === "connecting"
                  ? "Connecting…"
                  : "Connected"}
            </Text>
            <View style={styles.callControls}>
              <TouchableOpacity style={styles.callControlBtn} onPress={toggleMute}>
                <Text style={styles.callBtnText}>{muted ? "🔇" : "🎤"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.callEndBtn} onPress={calls.endCall}>
                <Text style={styles.callBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: theme.bgPanel,
    borderRadius: 12,
    padding: 24,
    width: "100%",
    maxWidth: 320,
  },
  modalTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: "600", marginBottom: 8 },
  modalText: { color: theme.textMuted, marginBottom: 20 },
  callActions: { flexDirection: "row", justifyContent: "center", gap: 24 },
  callReject: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.danger,
    justifyContent: "center",
    alignItems: "center",
  },
  callAccept: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#3ba55c",
    justifyContent: "center",
    alignItems: "center",
  },
  callBtnText: { color: "#fff", fontSize: 22 },
  callOverlay: { flex: 1, backgroundColor: "#0b141a" },
  remoteVideo: { ...StyleSheet.absoluteFillObject },
  hiddenRtc: { width: 0, height: 0, opacity: 0 },
  localVideo: {
    position: "absolute",
    bottom: 120,
    right: 16,
    width: 120,
    height: 160,
    borderRadius: 8,
  },
  callOverlayContent: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 48,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  voiceAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  voiceAvatarText: { color: "#fff", fontSize: 32, fontWeight: "700" },
  callName: { color: theme.textPrimary, fontSize: 20, fontWeight: "600" },
  callStatus: { color: theme.textMuted, marginTop: 4, marginBottom: 24 },
  callControls: { flexDirection: "row", gap: 20 },
  callControlBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.bgPanel,
    justifyContent: "center",
    alignItems: "center",
  },
  callEndBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.danger,
    justifyContent: "center",
    alignItems: "center",
  },
});
