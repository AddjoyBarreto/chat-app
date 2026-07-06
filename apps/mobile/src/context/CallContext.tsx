import { CallSession, type CallPhase } from "@vaultchat/client";
import type { CallType, WsServerEvent } from "@vaultchat/protocol";
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
import { Alert, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useApp } from "./AppContext";
import { callsSupported, getWebRtcAdapter } from "@/lib/webrtc";
import { theme } from "@/theme";

interface IncomingCall {
  callId: string;
  callerId: string;
  callerUsername: string;
  callType: CallType;
}

interface CallContextValue {
  callPhase: CallPhase;
  callType: CallType;
  callActive: boolean;
  canCall: boolean;
  activePeerUsername: string | null;
  startOutgoing: (peerId: string, peerUsername: string, type: CallType) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => void;
  endCall: () => void;
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

export function CallProvider({ children }: { children: ReactNode }) {
  const {
    session,
    connectionState,
    conversations,
    gatewaySend,
    onServerEventHandlers,
  } = useApp();

  const callSessionRef = useRef<CallSession | null>(null);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [callType, setCallType] = useState<CallType>("voice");
  const [activePeerUsername, setActivePeerUsername] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [webrtcAvailable] = useState(() => callsSupported());

  const resolveUsername = useCallback((userId: string) => {
    const conv = conversationsRef.current.find((c) => c.peerId === userId);
    return conv?.peerUsername ?? userId.slice(0, 8);
  }, []);

  const injectIncomingCall = useCallback(
    (callId: string, callerId: string, callType: CallType) => {
      void callSessionRef.current?.handleServerEvent({
        type: "call_incoming",
        callId,
        callerId,
        callType,
      });
    },
    []
  );

  useEffect(() => {
    if (!session || !webrtcAvailable) {
      callSessionRef.current = null;
      return;
    }

    const callSession = new CallSession({
      token: session.token,
      selfUserId: session.userId,
      sendWs: gatewaySend,
      webrtc: getWebRtcAdapter(),
      onPhaseChange: (phase, callId) => {
        setCallPhase(phase);
        const cs = callSessionRef.current;
        if (phase === "incoming" && cs && callId) {
          const callerId = cs.getPeerId();
          if (callerId) {
            setIncomingCall({
              callId,
              callerId,
              callerUsername: resolveUsername(callerId),
              callType: cs.getCallType(),
            });
          }
        }
        if (phase === "idle" || phase === "ended") {
          setIncomingCall(null);
          if (phase === "idle") setActivePeerUsername(null);
        }
        if (
          (phase === "outgoing" || phase === "connecting" || phase === "active") &&
          cs
        ) {
          const peerId = cs.getPeerId();
          if (peerId) {
            setActivePeerUsername(resolveUsername(peerId));
            setCallType(cs.getCallType());
          }
        }
      },
      onRemoteStream: () => {},
      onError: (msg) => Alert.alert("Call", msg),
    });
    callSessionRef.current = callSession;

    return () => {
      void callSession.endCall();
      callSessionRef.current = null;
    };
  }, [session?.token, session?.userId, gatewaySend, resolveUsername]);

  const handleServerEvent = useCallback((event: WsServerEvent) => {
    void callSessionRef.current?.handleServerEvent(event);
  }, []);

  useEffect(() => {
    onServerEventHandlers.current.add(handleServerEvent);
    return () => {
      onServerEventHandlers.current.delete(handleServerEvent);
    };
  }, [handleServerEvent, onServerEventHandlers]);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (!isIncomingCallData(data) || callPhase !== "idle") return;
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
  }, [callPhase, injectIncomingCall]);

  const callActive = callPhase !== "idle" && callPhase !== "ended";
  const canCall = webrtcAvailable && connectionState === "connected" && !callActive;

  async function startOutgoing(peerId: string, peerUsername: string, type: CallType) {
    if (!callSessionRef.current || callPhase !== "idle") return;
    if (!webrtcAvailable) {
      Alert.alert(
        "Calls require dev build",
        "Voice and video calls need a custom Expo dev build with react-native-webrtc. They are not available in Expo Go."
      );
      return;
    }
    setActivePeerUsername(peerUsername);
    setCallType(type);
    try {
      await callSessionRef.current.startOutgoing(peerId, type);
    } catch (e) {
      Alert.alert("Call failed", String(e));
    }
  }

  async function acceptIncoming() {
    if (!incomingCall || !callSessionRef.current) return;
    const call = incomingCall;
    setIncomingCall(null);
    try {
      await callSessionRef.current.acceptIncoming(
        call.callId,
        call.callerId,
        call.callType
      );
      router.push({
        pathname: "/conversation/[peerId]",
        params: { peerId: call.callerId, peerUsername: call.callerUsername },
      });
    } catch (e) {
      Alert.alert("Call failed", String(e));
    }
  }

  function rejectIncoming() {
    if (!incomingCall || !callSessionRef.current) return;
    callSessionRef.current.rejectIncoming(incomingCall.callId);
    setIncomingCall(null);
  }

  function endCall() {
    void callSessionRef.current?.endCall();
  }

  return (
    <CallContext.Provider
      value={{
        callPhase,
        callType,
        callActive,
        canCall,
        activePeerUsername,
        startOutgoing,
        acceptIncoming,
        rejectIncoming,
        endCall,
      }}
    >
      {children}

      <Modal visible={!!incomingCall} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Incoming call</Text>
            <Text style={styles.modalText}>
              @{incomingCall?.callerUsername} —{" "}
              {incomingCall?.callType === "video" ? "video" : "voice"}
            </Text>
            <View style={styles.callActions}>
              <TouchableOpacity style={styles.callReject} onPress={rejectIncoming}>
                <Text style={styles.callBtnText}>✕</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.callAccept}
                onPress={() => void acceptIncoming()}
              >
                <Text style={styles.callBtnText}>
                  {incomingCall?.callType === "video" ? "📹" : "📞"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={callActive && callPhase !== "incoming"}
        transparent
        animationType="slide"
      >
        <View style={styles.callOverlay}>
          <Text style={styles.callOverlayTitle}>@{activePeerUsername}</Text>
          <Text style={styles.callOverlayStatus}>
            {callPhase === "outgoing"
              ? "Calling…"
              : callPhase === "connecting"
                ? "Connecting…"
                : "Connected"}
          </Text>
          <TouchableOpacity style={styles.callRejectLarge} onPress={endCall}>
            <Text style={styles.callBtnText}>✕</Text>
          </TouchableOpacity>
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
    padding: 24,
  },
  modal: { backgroundColor: theme.bgHeader, borderRadius: 12, padding: 20 },
  modalTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: "500", marginBottom: 8 },
  modalText: { color: theme.textSecondary, lineHeight: 20, marginBottom: 16 },
  callActions: { flexDirection: "row", justifyContent: "center", gap: 32, marginTop: 8 },
  callAccept: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  callReject: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  callBtnText: { color: "#fff", fontSize: 22 },
  callOverlay: {
    flex: 1,
    backgroundColor: theme.bgApp,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  callOverlayTitle: { color: theme.textPrimary, fontSize: 22, marginBottom: 8 },
  callOverlayStatus: { color: theme.textSecondary, marginBottom: 32 },
  callRejectLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
  },
});
