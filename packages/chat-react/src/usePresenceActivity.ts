import type { SettablePresenceStatus } from "@vaultchat/protocol";
import { useEffect, useRef, type MutableRefObject } from "react";

const IDLE_MS = 5 * 60 * 1000;

function hasDomActivityEvents(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function" &&
    typeof window.removeEventListener === "function"
  );
}

export function usePresenceActivity({
  enabled,
  manualModeRef,
  ownPresence,
  onSetPresence,
}: {
  enabled: boolean;
  manualModeRef: MutableRefObject<SettablePresenceStatus | "auto">;
  ownPresence: SettablePresenceStatus;
  onSetPresence: (status: SettablePresenceStatus) => void;
}) {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !hasDomActivityEvents()) return;

    const clearIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const scheduleIdle = () => {
      clearIdleTimer();
      if (manualModeRef.current !== "auto") return;
      idleTimerRef.current = setTimeout(() => {
        if (manualModeRef.current === "auto") {
          onSetPresence("idle");
        }
      }, IDLE_MS);
    };

    const onActivity = () => {
      if (manualModeRef.current === "auto" && ownPresence === "idle") {
        onSetPresence("online");
      }
      scheduleIdle();
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "focus",
    ];

    for (const event of events) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    scheduleIdle();

    return () => {
      clearIdleTimer();
      for (const event of events) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [enabled, manualModeRef, onSetPresence, ownPresence]);
}
