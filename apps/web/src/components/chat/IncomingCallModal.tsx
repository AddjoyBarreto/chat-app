"use client";

import {
  IconPhone,
  IconPhoneHangup,
  IconVideo,
} from "@vaultchat/chat-react";
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
  const isVideo = callType === "video";
  const initial = callerUsername[0]?.toUpperCase() ?? "?";

  return (
    <div className="vc-call-modal" role="dialog" aria-label="Incoming call">
      <div className="vc-call-modal__card">
        <div className="vc-call-modal__rings" aria-hidden>
          <span className="vc-call-modal__ring vc-call-modal__ring--1" />
          <span className="vc-call-modal__ring vc-call-modal__ring--2" />
        </div>
        <div className="vc-call-modal__avatar">{initial}</div>
        <p className="vc-call-modal__title">@{callerUsername}</p>
        <p className="vc-call-modal__subtitle">
          <span className="vc-call-modal__type">
            {isVideo ? <IconVideo size={16} /> : <IconPhone size={16} />}
            Incoming {isVideo ? "video" : "voice"} call
          </span>
        </p>
        <div className="vc-call-modal__actions">
          <div className="vc-call-modal__action">
            <button
              type="button"
              className="vc-call-btn vc-call-btn--reject"
              onClick={onReject}
              aria-label="Decline call"
            >
              <IconPhoneHangup size={26} />
            </button>
            <span className="vc-call-modal__label">Decline</span>
          </div>
          <div className="vc-call-modal__action">
            <button
              type="button"
              className="vc-call-btn vc-call-btn--accept"
              onClick={onAccept}
              aria-label="Accept call"
            >
              {isVideo ? <IconVideo size={26} /> : <IconPhone size={26} />}
            </button>
            <span className="vc-call-modal__label">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
