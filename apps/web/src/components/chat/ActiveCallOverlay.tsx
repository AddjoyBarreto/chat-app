"use client";

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
    <div className={`vc-call-overlay${isVideo ? "" : " vc-call-overlay--voice"}`}>
      {isVideo ? (
        <>
          <video
            ref={remoteRef}
            className="vc-call-overlay__remote"
            autoPlay
            playsInline
          />
          <video
            ref={localRef}
            className={`vc-call-overlay__local${cameraOff ? " vc-call-overlay__local--off" : ""}`}
            autoPlay
            playsInline
            muted
          />
          {!remoteStream && (
            <div className="vc-call-overlay__waiting">
              <div className="vc-call-overlay__avatar vc-call-overlay__avatar--pulse">
                {initial}
              </div>
            </div>
          )}
        </>
      ) : (
        <audio ref={remoteAudioRef} autoPlay playsInline className="vc-call-overlay__audio" />
      )}

      <div className={`vc-call-overlay__panel${isVideo ? " vc-call-overlay__panel--video" : ""}`}>
        {!isVideo && (
          <div className="vc-call-overlay__avatar vc-call-overlay__avatar--pulse">
            {initial}
          </div>
        )}
        <p className="vc-call-overlay__name">@{peerUsername}</p>
        <p className="vc-call-overlay__status">{status}</p>

        <div className="vc-call-overlay__controls">
          {onToggleMute && (
            <button
              type="button"
              className={`vc-call-btn vc-call-btn--control${muted ? " vc-call-btn--off" : ""}`}
              onClick={() => setMuted(!onToggleMute())}
              aria-label={muted ? "Unmute" : "Mute"}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <IconMicOff size={22} /> : <IconMic size={22} />}
            </button>
          )}
          {isVideo && onToggleCamera && (
            <button
              type="button"
              className={`vc-call-btn vc-call-btn--control${cameraOff ? " vc-call-btn--off" : ""}`}
              onClick={() => setCameraOff(!onToggleCamera())}
              aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
              title={cameraOff ? "Turn camera on" : "Turn camera off"}
            >
              {cameraOff ? <IconVideoOff size={22} /> : <IconVideo size={22} />}
            </button>
          )}
          <button
            type="button"
            className="vc-call-btn vc-call-btn--reject vc-call-btn--large"
            onClick={onEnd}
            aria-label="End call"
            title="End call"
          >
            <IconPhoneHangup size={26} />
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
