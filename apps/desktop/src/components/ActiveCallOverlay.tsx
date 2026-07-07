import type { CallPhase } from "@vaultchat/client";
import type { CallType } from "@vaultchat/protocol";
import { useEffect, useRef, useState } from "react";

interface ActiveCallOverlayProps {
  phase: CallPhase;
  callType: CallType;
  peerUsername: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
  onToggleMute?: () => boolean;
  onToggleCamera?: () => boolean;
}

export function ActiveCallOverlay({
  phase,
  callType,
  peerUsername,
  localStream,
  remoteStream,
  onEnd,
  onToggleMute,
  onToggleCamera,
}: ActiveCallOverlayProps) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const status =
    phase === "outgoing"
      ? "Calling…"
      : phase === "incoming"
        ? "Incoming…"
        : phase === "connecting"
          ? "Connecting…"
          : "Connected";

  const isVideo = callType === "video";

  return (
    <div className={`dc-call${isVideo ? "" : " dc-call--voice"}`}>
      {isVideo ? (
        <>
          <video ref={remoteRef} className="dc-call__remote" autoPlay playsInline />
          <video
            ref={localRef}
            className={`dc-call__local${cameraOff ? " dc-call__local--off" : ""}`}
            autoPlay
            playsInline
            muted
          />
        </>
      ) : (
        <audio ref={remoteAudioRef} autoPlay playsInline className="dc-call__audio" />
      )}

      <div className="dc-call__panel">
        {!isVideo && (
          <div className="dc-call__avatar">{peerUsername[0]?.toUpperCase()}</div>
        )}
        <p className="dc-call__name">@{peerUsername}</p>
        <p className="dc-call__status">{status}</p>

        <div className="dc-call__controls">
          {onToggleMute && (
            <button
              type="button"
              className={`dc-call__btn${muted ? " dc-call__btn--off" : ""}`}
              onClick={() => setMuted(!onToggleMute())}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? "🔇" : "🎤"}
            </button>
          )}
          {isVideo && onToggleCamera && (
            <button
              type="button"
              className={`dc-call__btn${cameraOff ? " dc-call__btn--off" : ""}`}
              onClick={() => setCameraOff(!onToggleCamera())}
              title={cameraOff ? "Turn camera on" : "Turn camera off"}
            >
              {cameraOff ? "📷" : "📹"}
            </button>
          )}
          <button type="button" className="dc-call__btn dc-call__btn--end" onClick={onEnd} title="End call">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
