import {
  IconPhone,
  IconPhoneHangup,
  IconVideo,
} from "@vaultchat/chat-react";
import type { CallType } from "@vaultchat/protocol";

export function IncomingCallBanner({
  callerUsername,
  callType,
  onAccept,
  onReject,
}: {
  callerUsername: string;
  callType: CallType;
  onAccept: () => void;
  onReject: () => void;
}) {
  const isVideo = callType === "video";
  const initial = callerUsername[0]?.toUpperCase() ?? "?";

  return (
    <div className="dc-incoming-call" role="dialog" aria-label="Incoming call">
      <div className="dc-incoming-call__info">
        <div className="dc-incoming-call__avatar">{initial}</div>
        <div>
          <p className="dc-incoming-call__title">
            <span className="dc-incoming-call__type-icon">
              {isVideo ? <IconVideo size={14} /> : <IconPhone size={14} />}
            </span>
            Incoming {isVideo ? "video" : "voice"} call
          </p>
          <p className="dc-incoming-call__user">@{callerUsername}</p>
        </div>
      </div>
      <div className="dc-incoming-call__actions">
        <button
          type="button"
          className="dc-incoming-call__reject"
          onClick={onReject}
          aria-label="Decline call"
        >
          <IconPhoneHangup size={18} />
          <span>Decline</span>
        </button>
        <button
          type="button"
          className="dc-incoming-call__accept"
          onClick={onAccept}
          aria-label="Accept call"
        >
          {isVideo ? <IconVideo size={18} /> : <IconPhone size={18} />}
          <span>Accept</span>
        </button>
      </div>
    </div>
  );
}
