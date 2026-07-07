import {
  CallSession,
  type CallPhase,
  type StoredSession,
  type WebRtcAdapter,
} from "@vaultchat/client";
import type { CallType, WsClientEvent, WsServerEvent } from "@vaultchat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCallSessionOptions {
  session: StoredSession | null;
  send: (event: WsClientEvent) => boolean;
  isConnected: boolean;
  resolveUsername: (userId: string) => string;
  onToast?: (message: string, type?: "info" | "error") => void;
  webrtc?: WebRtcAdapter;
}

export function useCallSession({
  session,
  send,
  isConnected,
  resolveUsername,
  onToast,
  webrtc,
}: UseCallSessionOptions) {
  const toast = onToast ?? (() => {});
  const callSessionRef = useRef<CallSession | null>(null);
  const resolveUsernameRef = useRef(resolveUsername);
  resolveUsernameRef.current = resolveUsername;

  const [phase, setPhase] = useState<CallPhase>("idle");
  const [callType, setCallType] = useState<CallType>("voice");
  const [callPeer, setCallPeer] = useState<{ id: string; username: string } | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    callerId: string;
    callerUsername: string;
    callType: CallType;
  } | null>(null);

  useEffect(() => {
    if (!session) {
      callSessionRef.current = null;
      return;
    }

    const callSession = new CallSession({
      token: session.token,
      selfUserId: session.userId,
      sendWs: send,
      onPhaseChange: (nextPhase, callId) => {
        setPhase(nextPhase);
        const cs = callSessionRef.current;
        if (nextPhase === "incoming" && cs && callId) {
          const callerId = cs.getPeerId();
          if (callerId) {
            setIncomingCall({
              callId,
              callerId,
              callerUsername: resolveUsernameRef.current(callerId),
              callType: cs.getCallType(),
            });
          }
        }
        if (nextPhase === "idle" || nextPhase === "ended") {
          setIncomingCall(null);
          if (nextPhase === "idle") {
            setCallPeer(null);
            setLocalStream(null);
            setRemoteStream(null);
          }
        }
        if (
          (nextPhase === "outgoing" || nextPhase === "connecting" || nextPhase === "active") &&
          cs
        ) {
          const peerId = cs.getPeerId();
          if (peerId) {
            setCallPeer({ id: peerId, username: resolveUsernameRef.current(peerId) });
            setCallType(cs.getCallType());
          }
        }
      },
      onRemoteStream: setRemoteStream,
      onLocalStream: setLocalStream,
      onError: (msg) => toast(msg, "error"),
      webrtc,
    });
    callSessionRef.current = callSession;

    return () => {
      void callSession.endCall();
      callSessionRef.current = null;
    };
  }, [session?.token, session?.userId, send, toast, webrtc]);

  const handleServerEvent = useCallback((event: WsServerEvent) => {
    void callSessionRef.current?.handleServerEvent(event);
    if (event.type === "error" && event.error === "User offline") {
      toast("User is offline", "error");
    }
  }, [toast]);

  const startOutgoing = useCallback(
    async (calleeId: string, type: CallType) => {
      if (!callSessionRef.current || phase !== "idle") return;
      if (!isConnected) {
        toast("Not connected — wait for reconnection before calling", "error");
        return;
      }
      try {
        await callSessionRef.current.startOutgoing(calleeId, type);
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [phase, isConnected, toast]
  );

  const acceptIncoming = useCallback(async () => {
    if (!incomingCall || !callSessionRef.current) return;
    const call = incomingCall;
    setIncomingCall(null);
    try {
      await callSessionRef.current.acceptIncoming(call.callId, call.callerId, call.callType);
    } catch (e) {
      toast(String(e), "error");
    }
  }, [incomingCall, toast]);

  const rejectIncoming = useCallback(() => {
    if (!incomingCall || !callSessionRef.current) return;
    callSessionRef.current.rejectIncoming(incomingCall.callId);
    setIncomingCall(null);
  }, [incomingCall]);

  const endCall = useCallback(() => {
    void callSessionRef.current?.endCall();
  }, []);

  const toggleMute = useCallback(() => callSessionRef.current?.toggleMute() ?? false, []);
  const toggleCamera = useCallback(() => callSessionRef.current?.toggleCamera() ?? false, []);

  const canCall = phase === "idle" && isConnected;
  const inCall = phase !== "idle" && phase !== "ended";

  return {
    phase,
    callType,
    callPeer,
    localStream,
    remoteStream,
    incomingCall,
    canCall,
    inCall,
    startOutgoing,
    acceptIncoming,
    rejectIncoming,
    endCall,
    toggleMute,
    toggleCamera,
    handleServerEvent,
  };
}
