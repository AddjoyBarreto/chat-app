import {
  IconMic,
  IconMicOff,
  IconPhoneHangup,
  IconVideo,
  IconVideoOff,
} from "@vaultchat/chat-react";
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
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (phase !== "active") {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const status =
    phase === "outgoing"
      ? "Calling…"
      : phase === "incoming"
        ? "Incoming…"
        : phase === "connecting"
          ? "Connecting…"
          : formatElapsed(elapsed);

  const isVideo = callType === "video";
  const initial = peerUsername[0]?.toUpperCase() ?? "?";

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
          {!remoteStream && (
            <div className="dc-call__waiting">
              <div className="dc-call__avatar dc-call__avatar--pulse">{initial}</div>
            </div>
          )}
        </>
      ) : (
        <audio ref={remoteAudioRef} autoPlay playsInline className="dc-call__audio" />
      )}

      <div className="dc-call__panel">
        {!isVideo && (
          <div className="dc-call__avatar dc-call__avatar--pulse">{initial}</div>
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
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <IconMicOff size={20} /> : <IconMic size={20} />}
            </button>
          )}
          {isVideo && onToggleCamera && (
            <button
              type="button"
              className={`dc-call__btn${cameraOff ? " dc-call__btn--off" : ""}`}
              onClick={() => setCameraOff(!onToggleCamera())}
              title={cameraOff ? "Turn camera on" : "Turn camera off"}
              aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
            >
              {cameraOff ? <IconVideoOff size={20} /> : <IconVideo size={20} />}
            </button>
          )}
          <button
            type="button"
            className="dc-call__btn dc-call__btn--end"
            onClick={onEnd}
            title="End call"
            aria-label="End call"
          >
            <IconPhoneHangup size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
