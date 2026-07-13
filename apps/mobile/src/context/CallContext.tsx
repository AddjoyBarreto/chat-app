import { useCallSession } from "@vaultchat/chat-react";
import type { CallPhase } from "@vaultchat/client";
import type { CallType } from "@vaultchat/protocol";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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
  toggleCamera: () => boolean;
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

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { session, connectionState, conversations, gatewaySend, onServerEventHandlers } =
    useApp();

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [webrtcAvailable] = useState(() => callsSupported());
  const RTCView = getRtcView();
  const ringtoneRef = useRef<Audio.Sound | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

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
    ringtone: false,
  });

  useEffect(() => {
    const handler = calls.handleServerEvent;
    onServerEventHandlers.current.add(handler);
    return () => {
      onServerEventHandlers.current.delete(handler);
    };
  }, [calls.handleServerEvent, onServerEventHandlers]);

  const stopRingtone = useCallback(async () => {
    const sound = ringtoneRef.current;
    ringtoneRef.current = null;
    if (!sound) return;
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const shouldRing = calls.phase === "incoming" || calls.phase === "outgoing";
    if (!shouldRing) {
      void stopRingtone();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        await stopRingtone();
        const { sound } = await Audio.Sound.createAsync(
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("../../assets/sounds/incoming.mp3"),
          {
            isLooping: true,
            volume: calls.phase === "outgoing" ? 0.4 : 0.75,
          }
        );
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        ringtoneRef.current = sound;
        await sound.playAsync();
      } catch {
        /* ringtone optional */
      }
    })();

    return () => {
      cancelled = true;
      void stopRingtone();
    };
  }, [calls.phase, stopRingtone]);

  useEffect(() => {
    if (calls.phase !== "active") {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [calls.phase]);

  useEffect(() => {
    if (calls.phase !== "outgoing" && calls.phase !== "incoming" && calls.phase !== "connecting") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [calls.phase, pulse]);

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
    setMuted(false);
    setCameraOff(false);
    try {
      await calls.startOutgoing(peerId, type);
    } catch (e) {
      Alert.alert("Call failed", String(e));
    }
  }

  async function acceptIncoming() {
    if (!calls.incomingCall) return;
    const call = calls.incomingCall;
    setMuted(false);
    setCameraOff(false);
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

  function toggleCamera() {
    const enabled = calls.toggleCamera();
    setCameraOff(!enabled);
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

  const isVideo = calls.callType === "video";
  const incomingIsVideo = calls.incomingCall?.callType === "video";
  const statusText =
    calls.phase === "outgoing"
      ? "Calling…"
      : calls.phase === "connecting"
        ? "Connecting…"
        : formatElapsed(elapsed);

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
        toggleCamera,
      }}
    >
      {children}

      <Modal visible={!!calls.incomingCall} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.ringWrap}>
              <View style={styles.ringOuter} />
              <View style={styles.ringMid} />
              <Animated.View style={[styles.modalAvatar, { transform: [{ scale: pulse }] }]}>
                <Text style={styles.modalAvatarText}>
                  {calls.incomingCall?.callerUsername?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </Animated.View>
            </View>
            <Text style={styles.modalTitle}>@{calls.incomingCall?.callerUsername}</Text>
            <View style={styles.modalTypeRow}>
              <MaterialCommunityIcons
                name={incomingIsVideo ? "video" : "phone"}
                size={16}
                color={theme.textMuted}
              />
              <Text style={styles.modalText}>
                Incoming {incomingIsVideo ? "video" : "voice"} call
              </Text>
            </View>
            <View style={styles.callActions}>
              <View style={styles.actionCol}>
                <TouchableOpacity
                  style={styles.callReject}
                  onPress={calls.rejectIncoming}
                  accessibilityLabel="Decline call"
                >
                  <MaterialCommunityIcons name="phone-hangup" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.actionLabel}>Decline</Text>
              </View>
              <View style={styles.actionCol}>
                <TouchableOpacity
                  style={styles.callAccept}
                  onPress={() => void acceptIncoming()}
                  accessibilityLabel="Accept call"
                >
                  <MaterialCommunityIcons
                    name={incomingIsVideo ? "video" : "phone"}
                    size={28}
                    color="#fff"
                  />
                </TouchableOpacity>
                <Text style={styles.actionLabel}>Accept</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={calls.inCall && calls.phase !== "incoming"}
        transparent
        animationType="slide"
      >
        <View style={[styles.callOverlay, !isVideo && styles.callOverlayVoice]}>
          {RTCView && remoteUrl && isVideo ? (
            <RTCView streamURL={remoteUrl} style={styles.remoteVideo} objectFit="cover" />
          ) : null}

          {RTCView && remoteUrl && !isVideo ? (
            <RTCView streamURL={remoteUrl} style={styles.hiddenRtc} objectFit="cover" />
          ) : null}

          {isVideo && RTCView && localUrl ? (
            <RTCView
              streamURL={localUrl}
              style={[styles.localVideo, cameraOff && styles.localVideoOff]}
              objectFit="cover"
              mirror
            />
          ) : null}

          <View style={[styles.callOverlayContent, isVideo && styles.callOverlayContentVideo]}>
            {!isVideo && (
              <Animated.View style={[styles.voiceAvatar, { transform: [{ scale: pulse }] }]}>
                <Text style={styles.voiceAvatarText}>
                  {activePeerUsername?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </Animated.View>
            )}
            <Text style={styles.callName}>@{activePeerUsername}</Text>
            <Text style={styles.callStatus}>{statusText}</Text>
            <View style={styles.callControls}>
              <TouchableOpacity
                style={[styles.callControlBtn, muted && styles.callControlBtnOff]}
                onPress={toggleMute}
                accessibilityLabel={muted ? "Unmute" : "Mute"}
              >
                <MaterialCommunityIcons
                  name={muted ? "microphone-off" : "microphone"}
                  size={24}
                  color={muted ? theme.bgApp : "#fff"}
                />
              </TouchableOpacity>
              {isVideo && (
                <TouchableOpacity
                  style={[styles.callControlBtn, cameraOff && styles.callControlBtnOff]}
                  onPress={toggleCamera}
                  accessibilityLabel={cameraOff ? "Turn camera on" : "Turn camera off"}
                >
                  <MaterialCommunityIcons
                    name={cameraOff ? "video-off" : "video"}
                    size={24}
                    color={cameraOff ? theme.bgApp : "#fff"}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.callEndBtn}
                onPress={calls.endCall}
                accessibilityLabel="End call"
              >
                <MaterialCommunityIcons name="phone-hangup" size={26} color="#fff" />
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
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: theme.bgPanel,
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  ringWrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  ringOuter: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "rgba(0, 168, 132, 0.25)",
  },
  ringMid: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "rgba(0, 168, 132, 0.4)",
  },
  modalAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: theme.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  modalAvatarText: { color: "#fff", fontSize: 34, fontWeight: "700" },
  modalTitle: {
    color: theme.textPrimary,
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 8,
  },
  modalTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 28,
  },
  modalText: { color: theme.textMuted, fontSize: 15 },
  callActions: { flexDirection: "row", justifyContent: "center", gap: 40 },
  actionCol: { alignItems: "center", gap: 8 },
  actionLabel: { color: theme.textMuted, fontSize: 12 },
  callReject: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.danger,
    justifyContent: "center",
    alignItems: "center",
  },
  callAccept: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#25d366",
    justifyContent: "center",
    alignItems: "center",
  },
  callOverlay: { flex: 1, backgroundColor: "#071016" },
  callOverlayVoice: {
    backgroundColor: "#071016",
  },
  remoteVideo: { ...StyleSheet.absoluteFillObject },
  hiddenRtc: { width: 0, height: 0, opacity: 0 },
  localVideo: {
    position: "absolute",
    top: 56,
    right: 16,
    width: 110,
    height: 150,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
    zIndex: 2,
  },
  localVideoOff: { opacity: 0.4 },
  callOverlayContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 48,
    paddingHorizontal: 24,
  },
  callOverlayContentVideo: {
    justifyContent: "flex-end",
  },
  voiceAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  voiceAvatarText: { color: "#fff", fontSize: 44, fontWeight: "700" },
  callName: { color: theme.textPrimary, fontSize: 22, fontWeight: "600" },
  callStatus: {
    color: theme.textMuted,
    marginTop: 6,
    marginBottom: 32,
    fontVariant: ["tabular-nums"],
  },
  callControls: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "rgba(17, 27, 33, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  callControlBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  callControlBtnOff: {
    backgroundColor: "#fff",
  },
  callEndBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.danger,
    justifyContent: "center",
    alignItems: "center",
  },
});
