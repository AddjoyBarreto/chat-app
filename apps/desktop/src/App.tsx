import { useCallSession, useFriends, useVaultChat } from "@vaultchat/chat-react";
import type { CallType } from "@vaultchat/protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiscordLayout } from "./components/DiscordLayout";
import { AuthPanel } from "./components/AuthPanel";
import { ActiveCallOverlay } from "./components/ActiveCallOverlay";
import { IncomingCallBanner } from "./components/IncomingCallBanner";
import { SettingsPanel } from "./components/SettingsPanel";
import { ensureDesktopCallPermissions, isMediaPermissionDeniedError, openSystemMediaSettings } from "./lib/mediaPermissions";
import { MediaPermissionDialog } from "./components/MediaPermissionDialog";

export function App() {
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "info" | "error" }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mediaPermissionKind, setMediaPermissionKind] = useState<"microphone" | "camera" | null>(
    null
  );

  const [authError, setAuthError] = useState<string | null>(null);
  const lastToastRef = useRef<{ message: string; at: number } | null>(null);

  const showToast = useCallback((message: string, type: "info" | "error" = "info") => {
    if (
      type === "error" &&
      /Microphone or camera access is required|not allowed by the user agent|permission denied/i.test(
        message
      )
    ) {
      setMediaPermissionKind(
        /camera/i.test(message) && !/microphone or camera/i.test(message) ? "camera" : "microphone"
      );
      return;
    }

    const now = Date.now();
    const last = lastToastRef.current;
    if (last && last.message === message && now - last.at < 1500) return;
    lastToastRef.current = { message, at: now };

    if (type === "error") setAuthError(message);
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const callsRef = useRef<ReturnType<typeof useCallSession> | null>(null);
  const friendsRef = useRef<ReturnType<typeof useFriends> | null>(null);
  const groupServerEventRef = useRef<
    ((event: import("@vaultchat/protocol").WsServerEvent) => void) | undefined
  >();

  const chat = useVaultChat({
    deviceName: "Desktop",
    onToast: showToast,
    onServerEvent: (event) => {
      callsRef.current?.handleServerEvent(event);
      friendsRef.current?.handleServerEvent(event);
      groupServerEventRef.current?.(event);
    },
  });

  const friends = useFriends({
    token: chat.session?.token ?? null,
    userId: chat.session?.userId ?? null,
    isConnected: chat.isConnected,
    send: chat.send,
    onToast: showToast,
  });

  const calls = useCallSession({
    session: chat.session,
    send: chat.send,
    isConnected: chat.isConnected,
    resolveUsername: chat.resolveUsername,
    onToast: showToast,
  });

  const startOutgoing = useCallback(
    async (calleeId: string, type: CallType) => {
      try {
        await ensureDesktopCallPermissions(type);
        await calls.startOutgoing(calleeId, type);
      } catch (e) {
        const denied = isMediaPermissionDeniedError(e);
        if (denied) {
          setMediaPermissionKind(denied);
          return;
        }
        showToast(e instanceof Error ? e.message : String(e), "error");
      }
    },
    [calls, showToast]
  );

  const acceptIncoming = useCallback(async () => {
    const type = calls.incomingCall?.callType ?? "voice";
    try {
      await ensureDesktopCallPermissions(type);
      await calls.acceptIncoming();
    } catch (e) {
      const denied = isMediaPermissionDeniedError(e);
      if (denied) {
        setMediaPermissionKind(denied);
        return;
      }
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  }, [calls, showToast]);

  const callsWithPermissions = useMemo(
    () => ({
      ...calls,
      startOutgoing,
      acceptIncoming,
    }),
    [calls, startOutgoing, acceptIncoming]
  );

  useEffect(() => {
    callsRef.current = callsWithPermissions;
    friendsRef.current = friends;
  }, [callsWithPermissions, friends]);

  if (!chat.ready) {
    return (
      <div className="dc-loading">
        <div className="dc-spinner" />
      </div>
    );
  }

  if (!chat.session) {
    return (
      <>
        <AuthPanel
          loading={chat.loading}
          error={authError ?? chat.initError}
          onLogin={(id, pw) => {
            setAuthError(null);
            void chat.login(id, pw);
          }}
          onRegister={(fields) => {
            setAuthError(null);
            void chat.register(fields);
          }}
        />
        <ToastStack toasts={toasts} />
      </>
    );
  }

  if (!chat.session.emailVerified) {
    return (
      <div className="dc-auth-screen">
        <div className="dc-auth-card">
          <h1>Verify your email</h1>
          <p>Check your inbox, then restart the app after verifying.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <DiscordLayout
        chat={chat}
        friends={friends}
        calls={callsWithPermissions}
        onOpenSettings={() => setSettingsOpen(true)}
        groupServerEventRef={groupServerEventRef}
      />

      {calls.incomingCall && (
        <IncomingCallBanner
          callerUsername={calls.incomingCall.callerUsername}
          callType={calls.incomingCall.callType}
          onAccept={() => void acceptIncoming()}
          onReject={calls.rejectIncoming}
        />
      )}

      {calls.inCall && calls.callPeer && (
        <ActiveCallOverlay
          phase={calls.phase}
          callType={calls.callType}
          peerUsername={calls.callPeer.username}
          localStream={calls.localStream}
          remoteStream={calls.remoteStream}
          onEnd={calls.endCall}
          onToggleMute={calls.toggleMute}
          onToggleCamera={calls.callType === "video" ? calls.toggleCamera : undefined}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        token={chat.session.token}
        username={chat.session.username}
        currentDeviceId={chat.session.deviceId}
        onLogout={() => {
          setSettingsOpen(false);
          void chat.logout();
        }}
      />

      {mediaPermissionKind && (
        <MediaPermissionDialog
          kind={mediaPermissionKind}
          onDismiss={() => setMediaPermissionKind(null)}
          onOpenSettings={() => {
            void openSystemMediaSettings(mediaPermissionKind);
            setMediaPermissionKind(null);
          }}
        />
      )}

      <ToastStack toasts={toasts} />
    </>
  );
}

function ToastStack({
  toasts,
}: {
  toasts: { id: string; message: string; type: "info" | "error" }[];
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="dc-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`dc-toast dc-toast--${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
