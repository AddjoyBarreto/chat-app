"use client";

import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
} from "@/lib/countries";
import type {
  LoginFieldErrors,
  RegistrationFieldErrors,
  RegistrationFields,
} from "@/lib/session";

export type AuthMode = "register" | "login";

interface AuthScreenProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  registerFields: RegistrationFields;
  onRegisterFieldChange: <K extends keyof RegistrationFields>(
    key: K,
    value: RegistrationFields[K]
  ) => void;
  registerErrors: RegistrationFieldErrors;
  loginIdentifier: string;
  loginPassword: string;
  onLoginIdentifierChange: (v: string) => void;
  onLoginPasswordChange: (v: string) => void;
  loginErrors: LoginFieldErrors;
  onSubmit: () => void;
  loading: boolean;
}

function fieldClass(hasError: boolean): string {
  return `vc-input${hasError ? " vc-input--error" : ""}`;
}

export function AuthScreen({
  mode,
  onModeChange,
  registerFields,
  onRegisterFieldChange,
  registerErrors,
  loginIdentifier,
  loginPassword,
  onLoginIdentifierChange,
  onLoginPasswordChange,
  loginErrors,
  onSubmit,
  loading,
}: AuthScreenProps) {
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
        End-to-end encrypted messaging. Your keys stay on this device — we never see your
        messages.
      </p>

      <div className="vc-tabs" style={{ marginBottom: "1.25rem", maxWidth: 360, width: "100%" }}>
        <button
          type="button"
          className={`vc-tabs__btn${mode === "register" ? " vc-tabs__btn--active" : ""}`}
          onClick={() => onModeChange("register")}
        >
          Register
        </button>
        <button
          type="button"
          className={`vc-tabs__btn${mode === "login" ? " vc-tabs__btn--active" : ""}`}
          onClick={() => onModeChange("login")}
        >
          Sign in
        </button>
      </div>

      <form className="vc-form" onSubmit={handleSubmit} noValidate>
        {mode === "register" ? (
          <>
            <div className="vc-field">
              <input
                className={fieldClass(!!registerErrors.username)}
                value={registerFields.username}
                onChange={(e) => onRegisterFieldChange("username", e.target.value)}
                placeholder="Username"
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={32}
                disabled={loading}
                aria-invalid={!!registerErrors.username}
              />
              {registerErrors.username && (
                <p className="vc-field-error">{registerErrors.username}</p>
              )}
            </div>

            <div className="vc-field">
              <input
                className={fieldClass(!!registerErrors.email)}
                type="email"
                value={registerFields.email}
                onChange={(e) => onRegisterFieldChange("email", e.target.value)}
                placeholder="Email"
                autoComplete="email"
                disabled={loading}
                aria-invalid={!!registerErrors.email}
              />
              {registerErrors.email && <p className="vc-field-error">{registerErrors.email}</p>}
            </div>

            <div className="vc-field">
              <input
                className={fieldClass(!!registerErrors.password)}
                type="password"
                value={registerFields.password}
                onChange={(e) => onRegisterFieldChange("password", e.target.value)}
                placeholder="Password (8+ characters)"
                autoComplete="new-password"
                disabled={loading}
                aria-invalid={!!registerErrors.password}
              />
              {registerErrors.password && (
                <p className="vc-field-error">{registerErrors.password}</p>
              )}
            </div>

            <div className="vc-field">
              <div className="vc-phone-row">
                <select
                  className={`vc-select vc-select--country${registerErrors.phoneNumber ? " vc-input--error" : ""}`}
                  value={registerFields.phoneCountry || DEFAULT_PHONE_COUNTRY}
                  onChange={(e) => onRegisterFieldChange("phoneCountry", e.target.value)}
                  disabled={loading}
                  aria-label="Country"
                >
                  {PHONE_COUNTRIES.map((country) => (
                    <option key={country.iso} value={country.iso}>
                      {country.name} ({country.dial})
                    </option>
                  ))}
                </select>
                <input
                  className={`${fieldClass(!!registerErrors.phoneNumber)} vc-input--phone`}
                  type="tel"
                  inputMode="tel"
                  value={registerFields.phoneNumber}
                  onChange={(e) => onRegisterFieldChange("phoneNumber", e.target.value)}
                  placeholder="Phone number"
                  autoComplete="tel-national"
                  disabled={loading}
                  aria-invalid={!!registerErrors.phoneNumber}
                />
              </div>
              {registerErrors.phoneNumber && (
                <p className="vc-field-error">{registerErrors.phoneNumber}</p>
              )}
            </div>

            {registerErrors.form && <p className="vc-field-error">{registerErrors.form}</p>}
          </>
        ) : (
          <>
            <div className="vc-field">
              <input
                className={fieldClass(!!loginErrors.identifier)}
                value={loginIdentifier}
                onChange={(e) => onLoginIdentifierChange(e.target.value)}
                placeholder="Username or email"
                autoComplete="username"
                autoCapitalize="off"
                disabled={loading}
              />
              {loginErrors.identifier && (
                <p className="vc-field-error">{loginErrors.identifier}</p>
              )}
            </div>

            <div className="vc-field">
              <input
                className={fieldClass(!!loginErrors.password)}
                type="password"
                value={loginPassword}
                onChange={(e) => onLoginPasswordChange(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                disabled={loading}
              />
              {loginErrors.password && (
                <p className="vc-field-error">{loginErrors.password}</p>
              )}
            </div>

            {loginErrors.form && <p className="vc-field-error">{loginErrors.form}</p>}
          </>
        )}

        <button type="submit" className="vc-btn" disabled={loading}>
          {loading ? (
            <span
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <span className="vc-spinner" />
              {mode === "register" ? "Creating account…" : "Signing in…"}
            </span>
          ) : mode === "register" ? (
            "Create account"
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </div>
  );
}
