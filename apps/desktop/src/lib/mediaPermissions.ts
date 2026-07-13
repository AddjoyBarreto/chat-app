import type { CallType } from "@vaultchat/protocol";
import { open } from "@tauri-apps/plugin-shell";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Open macOS Privacy pane for microphone or camera (Discord-style). */
export async function openSystemMediaSettings(kind: "microphone" | "camera"): Promise<void> {
  const url =
    kind === "microphone"
      ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
      : "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera";
  try {
    await open(url);
  } catch {
    // Fallback: general Privacy & Security
    try {
      await open("x-apple.systempreferences:com.apple.preference.security");
    } catch {
      // ignore
    }
  }
}

/**
 * Discord-style: ask macOS for mic/camera only when starting or answering a call.
 * WKWebView often needs an explicit TCC request or getUserMedia fails with NotAllowedError.
 */
export async function ensureDesktopCallPermissions(callType: CallType): Promise<void> {
  if (!isTauri()) return;

  try {
    const {
      checkMicrophonePermission,
      requestMicrophonePermission,
      checkCameraPermission,
      requestCameraPermission,
    } = await import("tauri-plugin-macos-permissions-api");

    if (!(await checkMicrophonePermission())) {
      await requestMicrophonePermission();
    }
    if (!(await checkMicrophonePermission())) {
      const err = new Error("microphone_permission_denied");
      err.name = "MediaPermissionDenied";
      throw err;
    }

    if (callType === "video") {
      if (!(await checkCameraPermission())) {
        await requestCameraPermission();
      }
      if (!(await checkCameraPermission())) {
        const err = new Error("camera_permission_denied");
        err.name = "MediaPermissionDenied";
        throw err;
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "MediaPermissionDenied") throw err;
    // Plugin unavailable — fall through to getUserMedia.
  }
}

export function isMediaPermissionDeniedError(err: unknown): "microphone" | "camera" | null {
  if (!(err instanceof Error)) return null;
  if (err.name === "MediaPermissionDenied") {
    if (err.message === "camera_permission_denied") return "camera";
    return "microphone";
  }
  if (/Microphone access is required|microphone permission/i.test(err.message)) return "microphone";
  if (/Camera access is required|camera permission/i.test(err.message)) return "camera";
  if (err.name === "NotAllowedError" || /not allowed by the user agent/i.test(err.message)) {
    return "microphone";
  }
  return null;
}
