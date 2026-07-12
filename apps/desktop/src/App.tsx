import { useCallSession, useFriends, useVaultChat } from "@vaultchat/chat-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DiscordLayout } from "./components/DiscordLayout";
import { AuthPanel } from "./components/AuthPanel";
import { WelcomePanel } from "./components/WelcomePanel";
import { ActiveCallOverlay } from "./components/ActiveCallOverlay";
import { IncomingCallBanner } from "./components/IncomingCallBanner";
import { SettingsPanel } from "./components/SettingsPanel";

export function App() {
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "info" | "error" }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: "info" | "error" = "info") => {
    if (type === "error") setAuthError(message);
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const callsRef = useRef<ReturnType<typeof useCallSession> | null>(null);
  const friendsRef = useRef<ReturnType<typeof useFriends> | null>(null);
  const groupServerEventRef = useRef<((event: import("@vaultchat/protocol").WsServerEvent) => void) | undefined>();

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

  useEffect(() => {
    callsRef.current = calls;
    friendsRef.current = friends;
  }, [calls, friends]);

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
        calls={calls}
        onOpenSettings={() => setSettingsOpen(true)}
        groupServerEventRef={groupServerEventRef}
      />

      {calls.incomingCall && (
        <IncomingCallBanner
          callerUsername={calls.incomingCall.callerUsername}
          callType={calls.incomingCall.callType}
          onAccept={() => void calls.acceptIncoming()}
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
