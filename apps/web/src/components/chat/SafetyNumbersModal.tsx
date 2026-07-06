"use client";

interface SafetyNumbersModalProps {
  peerUsername: string;
  safetyNumber: string;
  onClose: () => void;
}

export function SafetyNumbersModal({
  peerUsername,
  safetyNumber,
  onClose,
}: SafetyNumbersModalProps) {
  return (
    <div className="vc-overlay" onClick={onClose} role="presentation">
      <div
        className="vc-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="safety-title"
      >
        <h2 id="safety-title" className="vc-modal__title">
          Verify encryption with @{peerUsername}
        </h2>
        <p className="vc-modal__text">
          Compare this number with your contact in person or over a trusted channel.
          If they match, your conversation is secure.
        </p>
        <div className="vc-safety-number">{safetyNumber}</div>
        <button
          type="button"
          className="vc-btn"
          style={{ width: "100%", marginTop: "1rem" }}
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  );
}
