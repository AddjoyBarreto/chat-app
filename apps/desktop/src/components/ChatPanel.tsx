import type { useCallSession, useFriends, useVaultChat } from "@vaultchat/chat-react";
import { presenceLabel, MESSAGE_MARKDOWN_HINT } from "@vaultchat/client";
import { MarkdownText, MarkdownComposerField, PresenceDot } from "@vaultchat/chat-react";
import { Virtuoso } from "react-virtuoso";
import { groupByDate } from "@vaultchat/client";
import { useEffect, useMemo, useRef, useState } from "react";

type Chat = ReturnType<typeof useVaultChat>;
type Calls = ReturnType<typeof useCallSession>;
type Friends = ReturnType<typeof useFriends>;

const START_INDEX = 100_000;

function formatTime(ts: string | number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatPanel({
  chat,
  calls,
  friends,
}: {
  chat: Chat;
  calls: Calls;
  friends: Friends;
}) {
  const peer = chat.peer!;
  const peerPresence = friends.getPresence(peer.id);
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  const prevFirstIdRef = useRef<string | undefined>(undefined);
  const prevLenRef = useRef(0);

  const items = useMemo(() => {
    const groups = groupByDate(chat.messages);
    const flat: Array<
      | { kind: "date"; id: string; label: string }
      | { kind: "message"; id: string; message: (typeof chat.messages)[0] }
    > = [];
    for (const g of groups) {
      const anchorId = g.messages[0]?.id ?? g.date;
      flat.push({ kind: "date", id: `date-${anchorId}`, label: g.date });
      for (const m of g.messages) {
        flat.push({ kind: "message", id: m.id, message: m });
      }
    }
    return flat;
  }, [chat.messages]);

  useEffect(() => {
    const firstId = chat.messages[0]?.id;
    const len = chat.messages.length;

    if (len === 0) {
      setFirstItemIndex(START_INDEX);
      prevFirstIdRef.current = undefined;
      prevLenRef.current = 0;
      return;
    }

    if (prevLenRef.current === 0) {
      setFirstItemIndex(START_INDEX);
    } else if (len > prevLenRef.current && firstId && firstId !== prevFirstIdRef.current) {
      setFirstItemIndex((idx) => idx - (len - prevLenRef.current));
    }

    prevFirstIdRef.current = firstId;
    prevLenRef.current = len;
  }, [chat.messages]);

  const hasDecryptFailures = chat.messages.some((m) => m.status === "decrypt_failed");

  return (
    <main className="dc-chat">
      <header className="dc-chat__header">
        <div className="dc-chat__peer">
          <span className="dc-chat__avatar-wrap">
            <span className="dc-chat__avatar-sm" aria-hidden>
              {peer.username[0]}
            </span>
            <PresenceDot status={peerPresence} className="dc-chat__avatar-dot" />
          </span>
          <div className="dc-chat__header-text">
            <h1 className="dc-chat__title">{peer.username}</h1>
            <span className="dc-chat__status">{presenceLabel(peerPresence)}</span>
          </div>
        </div>
        <div className="dc-chat__header-actions">
          {calls.canCall && (
            <>
              <button
                type="button"
                className="dc-icon-btn"
                title="Voice call"
                onClick={() => void calls.startOutgoing(peer.id, "voice")}
              >
                <PhoneIcon />
              </button>
              <button
                type="button"
                className="dc-icon-btn"
                title="Video call"
                onClick={() => void calls.startOutgoing(peer.id, "video")}
              >
                <VideoIcon />
              </button>
              <span className="dc-chat__header-divider" aria-hidden />
            </>
          )}
          <span className="dc-chat__encrypted" title="End-to-end encrypted">
            <LockIcon />
            <span>Encrypted</span>
          </span>
        </div>
      </header>

      {hasDecryptFailures && (
        <div className="dc-chat__banner" role="status">
          Some older messages can&apos;t be read on this device (normal after linking a new app). Ask
          your contact to send a new message — new messages should work.
        </div>
      )}

      <div className="dc-chat__messages">
        {items.length === 0 ? (
          <div className="dc-chat__empty">
            <div className="dc-chat__empty-icon">
              <LockIcon />
            </div>
            <p className="dc-chat__empty-title">Your messages are private</p>
            <p className="dc-chat__empty-sub">
              Send a message to start an encrypted conversation with @{peer.username}.
            </p>
          </div>
        ) : (
          <Virtuoso
            className="dc-chat__virtuoso"
            style={{ height: "100%" }}
            data={items}
            firstItemIndex={firstItemIndex}
            initialTopMostItemIndex={items.length - 1}
            followOutput="smooth"
            atTopStateChange={(atTop) => {
              if (atTop && chat.hasMoreMessages && !chat.loadingOlder) {
                void chat.loadOlderMessages();
              }
            }}
            itemContent={(_i, item) => {
              if (item.kind === "date") {
                return (
                  <div className="dc-date">
                    <span>{item.label}</span>
                  </div>
                );
              }
              const m = item.message;
              const isOut = m.from === "me";
              const failed = m.status === "decrypt_failed";
              const body =
                failed
                  ? null
                  : m.content.type === "text" && m.content.text
                    ? m.content.text
                    : "📎 Attachment";

              if (isOut) {
                return (
                  <div className="dc-msg-row dc-msg-row--out">
                    <div className={`dc-bubble dc-bubble--out${failed ? " dc-bubble--failed" : ""}`}>
                      {failed ? (
                        <span className="dc-bubble__failed-text">Unable to decrypt</span>
                      ) : body ? (
                        <MarkdownText text={body} className="dc-bubble__text" />
                      ) : null}
                      <span className="dc-bubble__time">{formatTime(m.time)}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div className="dc-msg-row dc-msg-row--in">
                  <span className="dc-msg__avatar">{peer.username[0]}</span>
                  <div className="dc-msg__body">
                    <div className="dc-msg__meta">
                      <span className="dc-msg__author">{peer.username}</span>
                      <span className="dc-msg__time">{formatTime(m.time)}</span>
                    </div>
                    {failed ? (
                      <div className="dc-bubble dc-bubble--failed dc-bubble--in-failed">
                        <LockIcon />
                        <span>Unable to decrypt this message</span>
                      </div>
                    ) : body ? (
                      <p className="dc-msg__text">
                        <MarkdownText text={body} />
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            }}
            components={{
              Header: () =>
                chat.loadingOlder ? (
                  <div className="dc-chat__load-older">Loading older messages…</div>
                ) : null,
            }}
          />
        )}
      </div>

      <form
        className="dc-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void chat.sendMessage();
        }}
      >
        <div className="dc-composer__bar">
          <MarkdownComposerField
            value={chat.draft}
            onChange={chat.setDraft}
            fieldClassName="dc-composer-field"
            inputClassName="dc-composer__input"
            placeholder={`Message @${peer.username} (${MESSAGE_MARKDOWN_HINT})`}
            disabled={chat.sending}
            rows={1}
          />
          <button
            type="submit"
            className="dc-composer__send"
            disabled={!chat.draft.trim() || chat.sending}
            title="Send"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </main>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3-9H9V6a3 3 0 0 1 6 0v2z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 0 0-1.02.24l-2.2 2.2a15.05 15.05 0 0 1-6.59-6.59l2.2-2.21a1 1 0 0 0 .24-1.02A11.36 11.36 0 0 1 8.5 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1 17 17 0 0 0 17 17 1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17 10.5V7a2 2 0 0 0-2-2H5A2 2 0 0 0 3 7v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}
