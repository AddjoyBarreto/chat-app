import type { CallPhase } from "@vaultchat/client";
import { useEffect, useRef } from "react";

const DEFAULT_RINGTONE_SRC = "/sounds/incoming.mp3";

/**
 * Loops a ringtone while the call is ringing (incoming or outgoing).
 * Uses the browser Audio API — no-op in React Native (handle there with expo-av).
 */
export function useCallRingtone(
  phase: CallPhase,
  options?: { src?: string; enabled?: boolean }
) {
  const src = options?.src ?? DEFAULT_RINGTONE_SRC;
  const enabled = options?.enabled ?? true;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!enabled || typeof Audio === "undefined") return;

    const shouldRing = phase === "incoming" || phase === "outgoing";
    if (!shouldRing) {
      const existing = audioRef.current;
      if (existing) {
        existing.pause();
        existing.currentTime = 0;
      }
      return;
    }

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(src);
      audio.loop = true;
      audio.preload = "auto";
      audioRef.current = audio;
    } else if (!audio.src.endsWith(src.replace(/^\//, "")) && audio.getAttribute("src") !== src) {
      audio.src = src;
    }

    audio.volume = phase === "outgoing" ? 0.4 : 0.75;
    void audio.play().catch(() => {
      /* Autoplay may be blocked until a user gesture; ignore. */
    });

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [phase, src, enabled]);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        audioRef.current = null;
      }
    };
  }, []);
}
