"use client";

interface RegisterScreenProps {
  username: string;
  onUsernameChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  fieldError: string | null;
}

export function RegisterScreen({
  username,
  onUsernameChange,
  onSubmit,
  loading,
  fieldError,
}: RegisterScreenProps) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <div className="vc-register">
      <div className="vc-register__logo" aria-hidden>
        🔒
      </div>
      <h1 className="vc-register__title">VaultChat</h1>
      <p className="vc-register__subtitle">
        End-to-end encrypted messaging. Your keys are created on this device — we
        never see your messages.
      </p>
      <form className="vc-form" onSubmit={handleSubmit}>
        <input
          className={`vc-input${fieldError ? " vc-input--error" : ""}`}
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder="Choose a username"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={32}
          disabled={loading}
          aria-invalid={!!fieldError}
        />
        {fieldError && <p className="vc-field-error">{fieldError}</p>}
        <button type="submit" className="vc-btn" disabled={loading}>
          {loading ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span className="vc-spinner" /> Generating keys…
            </span>
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </div>
  );
}
