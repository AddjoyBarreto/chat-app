"use client";

import { useRef } from "react";
import { VirtualMessageList } from "./VirtualMessageList";
import type { DisplayMessage } from "@/lib/messages";

interface ConversationViewProps {
  peerUsername: string;
  messages: DisplayMessage[];
  draft: string;
  onDraftChange: (v: string) => void;
  onSend: () => void;
  onBack: () => void;
  onVerify: () => void;
  onAttachFile: (file: File) => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  callActive?: boolean;
  sending: boolean;
  connectionState: string;
  authToken?: string;
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
  hasMore?: boolean;
}

export function ConversationView({
  peerUsername,
  messages,
  draft,
  onDraftChange,
  onSend,
  onBack,
  onVerify,
  onAttachFile,
  authToken,
  onVoiceCall,
  onVideoCall,
  callActive,
  sending,
  connectionState,
  onLoadOlder,
  loadingOlder,
  hasMore,
}: ConversationViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    onSend();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim() && !sending) onSend();
    }
  }

  return (
    <>
      <header className="vc-header">
        <button type="button" className="vc-header__back" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <div className="vc-header__avatar">{peerUsername[0]}</div>
        <div className="vc-header__info">
          <div className="vc-header__title">@{peerUsername}</div>
          <div
            className={`vc-header__subtitle${
              connectionState === "connected" ? " vc-header__subtitle--online" : ""
            }`}
          >
            {connectionState === "connected"
              ? "🔒 End-to-end encrypted"
              : connectionState === "reconnecting"
                ? "Reconnecting…"
                : "Connecting…"}
          </div>
        </div>
        <div className="vc-header__actions">
          {onVoiceCall && (
            <button
              type="button"
              className="vc-icon-btn"
              onClick={onVoiceCall}
              disabled={callActive || connectionState !== "connected"}
              title="Voice call"
              aria-label="Voice call"
            >
              📞
            </button>
          )}
          {onVideoCall && (
            <button
              type="button"
              className="vc-icon-btn"
              onClick={onVideoCall}
              disabled={callActive || connectionState !== "connected"}
              title="Video call"
              aria-label="Video call"
            >
              📹
            </button>
          )}
          <button
            type="button"
            className="vc-icon-btn"
            onClick={onVerify}
            title="Verify safety number"
            aria-label="Verify encryption"
          >
            🛡️
          </button>
        </div>
      </header>

      <div className="vc-messages">
        <VirtualMessageList
          messages={messages}
          authToken={authToken}
          onLoadOlder={onLoadOlder}
          loadingOlder={loadingOlder}
          hasMore={hasMore}
        />
      </div>

      <form className="vc-composer" onSubmit={handleSubmit}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onAttachFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="vc-composer__attach"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach image"
          disabled={sending}
        >
          📎
        </button>
        <textarea
          className="vc-composer__input"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message"
          rows={1}
          disabled={sending}
        />
        <button
          type="submit"
          className="vc-composer__send"
          disabled={!draft.trim() || sending}
          aria-label="Send"
        >
          {sending ? <span className="vc-spinner" /> : "➤"}
        </button>
      </form>
    </>
  );
}
