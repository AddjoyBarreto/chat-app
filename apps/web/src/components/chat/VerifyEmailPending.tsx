"use client";

interface VerifyEmailPendingProps {
  onResend: () => void;
  onLogout: () => void;
  resending: boolean;
}

export function VerifyEmailPending({ onResend, onLogout, resending }: VerifyEmailPendingProps) {
  return (
    <div className="vc-register">
      <div className="vc-register__logo" aria-hidden>
        ✉️
      </div>
      <h1 className="vc-register__title">Verify your email</h1>
      <p className="vc-register__subtitle">
        We sent a verification link to your inbox. Open it on this device, then return here and
        sign in.
      </p>
      <p className="vc-register__subtitle" style={{ fontSize: "0.85rem" }}>
        Local dev: check the API server terminal for the verification URL if SMTP is not
        configured.
      </p>
      <div className="vc-form">
        <button type="button" className="vc-btn" onClick={onResend} disabled={resending}>
          {resending ? "Sending…" : "Resend verification email"}
        </button>
        <button
          type="button"
          className="vc-btn vc-btn--ghost"
          style={{ marginTop: 12 }}
          onClick={onLogout}
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}
