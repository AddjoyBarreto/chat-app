"use client";

import type { DisplayMessage } from "@/lib/messages";
import { formatMessageTime } from "@/lib/messages";
import { MediaAttachment } from "./MediaAttachment";

export function MessageBubble({
  message,
  authToken,
}: {
  message: DisplayMessage;
  authToken?: string;
}) {
  const isOut = message.from === "me";
  const failed = message.status === "decrypt_failed" || message.status === "failed";

  return (
    <div className={`vc-bubble-row vc-bubble-row--${isOut ? "out" : "in"}`}>
      <div
        className={`vc-bubble vc-bubble--${isOut ? "out" : "in"}${failed ? " vc-bubble--failed" : ""}`}
      >
        {message.status === "decrypt_failed" ? (
          <span>🔒 Unable to decrypt this message</span>
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
            {message.content.text && <span>{message.content.text}</span>}
          </>
        )}
        <div className="vc-bubble__meta">
          <span className="vc-bubble__lock" title="End-to-end encrypted">
            🔒
          </span>
          <span className="vc-bubble__time">{formatMessageTime(message.time)}</span>
        </div>
      </div>
    </div>
  );
}
