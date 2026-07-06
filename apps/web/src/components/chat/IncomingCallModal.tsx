"use client";

import type { CallType } from "@vaultchat/protocol";

interface IncomingCallModalProps {
  callerUsername: string;
  callType: CallType;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({
  callerUsername,
  callType,
  onAccept,
  onReject,
}: IncomingCallModalProps) {
  return (
    <div className="vc-call-modal" role="dialog" aria-label="Incoming call">
      <div className="vc-call-modal__card">
        <div className="vc-call-modal__avatar">{callerUsername[0]}</div>
        <p className="vc-call-modal__title">@{callerUsername}</p>
        <p className="vc-call-modal__subtitle">
          Incoming {callType === "video" ? "video" : "voice"} call…
        </p>
        <div className="vc-call-modal__actions">
          <button
            type="button"
            className="vc-call-btn vc-call-btn--reject"
            onClick={onReject}
            aria-label="Decline call"
          >
            ✕
          </button>
          <button
            type="button"
            className="vc-call-btn vc-call-btn--accept"
            onClick={onAccept}
            aria-label="Accept call"
          >
            {callType === "video" ? "📹" : "📞"}
          </button>
        </div>
      </div>
    </div>
  );
}
