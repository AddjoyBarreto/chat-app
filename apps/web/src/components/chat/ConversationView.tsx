"use client";

import { useRef } from "react";
import { VirtualMessageList } from "./VirtualMessageList";
import type { DisplayMessage } from "@/lib/messages";
import { MESSAGE_MARKDOWN_HINT } from "@vaultchat/client";
import { MarkdownComposerField } from "@vaultchat/chat-react";

interface ConversationViewProps {
  peerUsername: string;
  peerPresenceLabel?: string;
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
  peerPresenceLabel,
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
  const isOnline = peerPresenceLabel?.toLowerCase() === "online";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    onSend();
  }

  return (
    <div className="vc-conversation">
      <header className="vc-header vc-header--conversation">
        <button type="button" className="vc-header__back" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <div className="vc-header__avatar">{peerUsername[0]}</div>
        <div className="vc-header__info">
          <div className="vc-header__title">{peerUsername}</div>
          <div
            className={`vc-header__subtitle${isOnline ? " vc-header__subtitle--online" : ""}`}
          >
            {peerPresenceLabel && <span>{peerPresenceLabel}</span>}
            {peerPresenceLabel && <span className="vc-header__subtitle-sep" aria-hidden>·</span>}
            <span className="vc-header__subtitle-encrypted">End-to-end encrypted</span>
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

      <div className="vc-messages vc-messages--conversation">
        <div className="vc-messages__inner">
          <VirtualMessageList
            messages={messages}
            authToken={authToken}
            onLoadOlder={onLoadOlder}
            loadingOlder={loadingOlder}
            hasMore={hasMore}
          />
        </div>
      </div>

      <form className="vc-composer vc-composer--conversation" onSubmit={handleSubmit}>
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
        <MarkdownComposerField
          value={draft}
          onChange={onDraftChange}
          onSubmit={() => {
            if (!draft.trim() || sending) return;
            onSend();
          }}
          placeholder={`Message (${MESSAGE_MARKDOWN_HINT})`}
          disabled={sending}
          rows={1}
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
    </div>
  );
}
