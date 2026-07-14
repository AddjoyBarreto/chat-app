"use client";

import type { DisplayMessage } from "@/lib/messages";
import { formatMessageTime } from "@/lib/messages";
import { OWN_UNAVAILABLE_TEXT, PEER_UNAVAILABLE_TEXT } from "@vaultchat/client";
import { MarkdownText } from "@vaultchat/chat-react";
import { MediaAttachment } from "./MediaAttachment";

export function MessageBubble({
  message,
  authToken,
  groupedWithPrev = false,
  groupedWithNext = false,
}: {
  message: DisplayMessage;
  authToken?: string;
  groupedWithPrev?: boolean;
  groupedWithNext?: boolean;
}) {
  const isOut = message.from === "me";
  const failed = message.status === "decrypt_failed" || message.status === "failed";

  const rowClass = [
    "vc-bubble-row",
    isOut ? "vc-bubble-row--out" : "vc-bubble-row--in",
    groupedWithPrev ? "vc-bubble-row--grouped" : "",
    !groupedWithNext ? "vc-bubble-row--group-end" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const bubbleClass = [
    "vc-bubble",
    isOut ? "vc-bubble--out" : "vc-bubble--in",
    failed ? "vc-bubble--failed" : "",
    !groupedWithPrev ? "vc-bubble--group-start" : "vc-bubble--group-mid",
    !groupedWithNext ? "vc-bubble--group-end" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rowClass}>
      <div className={bubbleClass}>
        {message.status === "decrypt_failed" ? (
          <span>
            {message.content.text ||
              (message.from === "me" ? OWN_UNAVAILABLE_TEXT : PEER_UNAVAILABLE_TEXT)}
          </span>
        ) : (
          <>
            {message.content.type === "image" && message.content.image && (
              <img
                src={`data:${message.content.image.mime};base64,${message.content.image.data}`}
                alt="Encrypted image"
                className="vc-bubble__image"
              />
            )}
            {message.content.type === "media" && message.content.media && authToken && (
              <MediaAttachment token={authToken} media={message.content.media} />
            )}
            {message.content.type === "media" && message.content.media && !authToken && (
              <span>🔒 Encrypted attachment</span>
            )}
            {message.content.text && (
              <MarkdownText text={message.content.text} className="vc-bubble__text" />
            )}
          </>
        )}
        <div className="vc-bubble__meta">
          <span className="vc-bubble__lock" title="End-to-end encrypted" aria-hidden>
            🔒
          </span>
          <span className="vc-bubble__time">{formatMessageTime(message.time)}</span>
        </div>
      </div>
    </div>
  );
}
