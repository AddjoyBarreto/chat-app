"use client";

import type { CallPhase } from "@vaultchat/client";
import type { CallType } from "@vaultchat/protocol";
import { useEffect, useRef } from "react";

interface ActiveCallOverlayProps {
  phase: CallPhase;
  callType: CallType;
  peerUsername: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
}

export function ActiveCallOverlay({
  phase,
  callType,
  peerUsername,
  localStream,
  remoteStream,
  onEnd,
}: ActiveCallOverlayProps) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const status =
    phase === "outgoing"
      ? "Calling…"
      : phase === "incoming"
        ? "Incoming…"
        : phase === "connecting"
          ? "Connecting…"
          : "Connected";

  return (
    <div className="vc-call-overlay">
      {callType === "video" && (
        <>
          <video
            ref={remoteRef}
            className="vc-call-overlay__remote"
            autoPlay
            playsInline
          />
          <video
            ref={localRef}
            className="vc-call-overlay__local"
            autoPlay
            playsInline
            muted
          />
        </>
      )}

      <div className="vc-call-overlay__panel">
        <div className="vc-call-overlay__avatar">{peerUsername[0]}</div>
        <p className="vc-call-overlay__name">@{peerUsername}</p>
        <p className="vc-call-overlay__status">{status}</p>
        <button
          type="button"
          className="vc-call-btn vc-call-btn--reject vc-call-btn--large"
          onClick={onEnd}
          aria-label="End call"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
