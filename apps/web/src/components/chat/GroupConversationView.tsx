"use client";

import type { MessageContent } from "@vaultchat/protocol";
import { formatMessageTime, groupByDate } from "@/lib/messages";
import { MarkdownText, MarkdownComposerField } from "@vaultchat/chat-react";
import { MESSAGE_MARKDOWN_HINT } from "@vaultchat/client";
import { useEffect, useRef } from "react";
import { MediaAttachment } from "./MediaAttachment";

export interface GroupDisplayMessage {
  id: string;
  from: "me" | "them";
  text: string;
  content: MessageContent;
  time: string;
  date: string;
  failed?: boolean;
  senderId?: string;
}

interface GroupConversationViewProps {
  groupName: string;
  messages: GroupDisplayMessage[];
  draft: string;
  onDraftChange: (v: string) => void;
  onSend: () => void;
  onBack: () => void;
  onAttachFile?: (file: File) => void;
  onReshareKey?: () => void;
  sending: boolean;
  resharing?: boolean;
  authToken?: string;
  isAdmin?: boolean;
  hasGroupKey?: boolean;
}

function GroupMessageBody({
  content,
  authToken,
  failed,
}: {
  content: MessageContent;
  authToken?: string;
  failed?: boolean;
}) {
  if (failed) return <span>{content.text}</span>;

  if (content.type === "image" && content.image) {
    return (
      <img
        src={`data:${content.image.mime};base64,${content.image.data}`}
        alt="Encrypted image"
        className="vc-bubble__image"
      />
    );
  }

  if (content.type === "media" && content.media && authToken) {
    return <MediaAttachment token={authToken} media={content.media} />;
  }

  if (content.type === "media" && content.media) {
    return <span>🔒 Encrypted attachment</span>;
  }

  if (content.text) return <MarkdownText text={content.text} className="vc-bubble__text" />;
  return null;
}

export function GroupConversationView({
  groupName,
  messages,
  draft,
  onDraftChange,
  onSend,
  onBack,
  onAttachFile,
  onReshareKey,
  sending,
  resharing,
  authToken,
  isAdmin,
  hasGroupKey,
}: GroupConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const groups = groupByDate(
    messages.map((m) => ({
      id: m.id,
      from: m.from,
      content: m.content,
      time: m.time,
      date: m.date,
      status: m.failed ? ("decrypt_failed" as const) : ("delivered" as const),
    }))
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending || !hasGroupKey) return;
    onSend();
  }

  return (
    <>
      <header className="vc-header">
        <button type="button" className="vc-header__back" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <div className="vc-header__avatar">👥</div>
        <div className="vc-header__info">
          <div className="vc-header__title">{groupName}</div>
          <div className="vc-header__subtitle vc-header__subtitle--online">
            🔒 End-to-end encrypted group
          </div>
        </div>
        {isAdmin && hasGroupKey && onReshareKey && (
          <div className="vc-header__actions">
            <button
              type="button"
              className="vc-icon-btn"
              onClick={onReshareKey}
              disabled={resharing}
              title="Re-share encryption key with all members"
              aria-label="Re-share group key"
            >
              🔑
            </button>
          </div>
        )}
      </header>

      {!hasGroupKey && (
        <div className="vc-banner vc-banner--warning">
          Missing group encryption key — ask the admin to tap 🔑 to re-share, or check your DMs
        </div>
      )}

      <div className="vc-messages">
        {messages.length === 0 ? (
          <div className="vc-empty" style={{ flex: 1 }}>
            <div className="vc-empty__icon">👥</div>
            <p className="vc-empty__text">
              Group messages are encrypted with a shared key distributed via pairwise sessions.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.messages[0]?.id ?? g.date}>
              <div className="vc-date-divider">
                <span className="vc-date-divider__pill">{g.date}</span>
              </div>
              {g.messages.map((m) => {
                const original = messages.find((x) => x.id === m.id)!;
                const isOut = original.from === "me";
                return (
                  <div
                    key={m.id}
                    className={`vc-bubble-row vc-bubble-row--${isOut ? "out" : "in"}`}
                  >
                    <div
                      className={`vc-bubble vc-bubble--${isOut ? "out" : "in"}${original.failed ? " vc-bubble--failed" : ""}`}
                    >
                      <GroupMessageBody
                        content={original.content}
                        authToken={authToken}
                        failed={original.failed}
                      />
                      <div className="vc-bubble__meta">
                        <span className="vc-bubble__lock">🔒</span>
                        <span className="vc-bubble__time">{formatMessageTime(original.time)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form className="vc-composer" onSubmit={handleSubmit}>
        {onAttachFile && (
          <>
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
              disabled={sending || !hasGroupKey}
              aria-label="Attach media"
            >
              📎
            </button>
          </>
        )}
        <MarkdownComposerField
          value={draft}
          onChange={onDraftChange}
          onSubmit={() => {
            if (!draft.trim() || sending || !hasGroupKey) return;
            onSend();
          }}
          placeholder={hasGroupKey ? `Group message (${MESSAGE_MARKDOWN_HINT})` : "Waiting for encryption key…"}
          disabled={sending || !hasGroupKey}
          rows={1}
        />
        <button
          type="submit"
          className="vc-composer__send"
          disabled={!draft.trim() || sending || !hasGroupKey}
          aria-label="Send"
        >
          {sending ? <span className="vc-spinner" /> : "➤"}
        </button>
      </form>
    </>
  );
}
