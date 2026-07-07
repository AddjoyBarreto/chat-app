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
  return (
    <div className="dc-incoming-call">
      <div className="dc-incoming-call__info">
        <span className="dc-incoming-call__icon">{callType === "video" ? "📹" : "📞"}</span>
        <div>
          <p className="dc-incoming-call__title">Incoming {callType} call</p>
          <p className="dc-incoming-call__user">@{callerUsername}</p>
        </div>
      </div>
      <div className="dc-incoming-call__actions">
        <button type="button" className="dc-incoming-call__accept" onClick={onAccept}>
          Accept
        </button>
        <button type="button" className="dc-incoming-call__reject" onClick={onReject}>
          Decline
        </button>
      </div>
    </div>
  );
}
