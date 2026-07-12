import { useMemo, useState } from "react";
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  getCountryDialCode,
  normalizeRegistrationFields,
  validateRegistrationFields,
  type NormalizedRegistrationFields,
  type RegistrationFieldErrors,
} from "@vaultchat/client";

export function AuthPanel({
  loading,
  error,
  onLogin,
  onRegister,
}: {
  loading: boolean;
  error?: string | null;
  onLogin: (identifier: string, password: string) => void;
  onRegister: (fields: NormalizedRegistrationFields) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegistrationFieldErrors>({});

  const dialCode = useMemo(() => getCountryDialCode(phoneCountry), [phoneCountry]);

  function clearFieldError(key: keyof RegistrationFieldErrors) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "login") {
      onLogin(identifier, password);
      return;
    }
    const fields = {
      username,
      email,
      password,
      phoneCountry,
      phoneNumber,
    };
    const errors = validateRegistrationFields(fields);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    onRegister(normalizeRegistrationFields(fields));
  }

  return (
    <div className="dc-auth-screen">
      <div className="dc-auth-card">
        <div className="dc-auth-logo">VaultChat</div>
        <h1>{mode === "login" ? "Welcome back" : "Create an account"}</h1>
        <p className="dc-muted">End-to-end encrypted messaging for desktop</p>

        <div className="dc-auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "dc-auth-tabs__active" : ""}
            onClick={() => {
              setMode("login");
              setFieldErrors({});
            }}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === "register" ? "dc-auth-tabs__active" : ""}
            onClick={() => {
              setMode("register");
              setFieldErrors({});
            }}
          >
            Register
          </button>
        </div>

        <form className="dc-auth-form" onSubmit={handleSubmit}>
          {error && (
            <p className="dc-auth-error" role="alert">
              {error}
            </p>
          )}
          {mode === "register" && (
            <>
              <label>
                Username
                <input
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    clearFieldError("username");
                  }}
                  autoComplete="username"
                  aria-invalid={!!fieldErrors.username}
                />
                {fieldErrors.username && (
                  <span className="dc-auth-field-error">{fieldErrors.username}</span>
                )}
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError("email");
                  }}
                  autoComplete="email"
                  aria-invalid={!!fieldErrors.email}
                />
                {fieldErrors.email && (
                  <span className="dc-auth-field-error">{fieldErrors.email}</span>
                )}
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError("password");
                  }}
                  placeholder="Password (8+ characters)"
                  autoComplete="new-password"
                  aria-invalid={!!fieldErrors.password}
                />
                {fieldErrors.password && (
                  <span className="dc-auth-field-error">{fieldErrors.password}</span>
                )}
              </label>
              <div className="dc-auth-phone">
                <span className="dc-auth-phone__label">Phone</span>
                <div className="dc-auth-phone__row">
                  <select
                    className="dc-auth-phone__country"
                    value={phoneCountry}
                    onChange={(e) => {
                      setPhoneCountry(e.target.value);
                      clearFieldError("phoneNumber");
                    }}
                    aria-label={`Country code ${dialCode}`}
                    title="Country code"
                    disabled={loading}
                  >
                    {PHONE_COUNTRIES.map((country) => (
                      <option key={country.iso} value={country.iso}>
                        {country.dial} {country.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="dc-auth-phone__number"
                    type="tel"
                    inputMode="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      clearFieldError("phoneNumber");
                    }}
                    placeholder="Phone number"
                    autoComplete="tel-national"
                    aria-invalid={!!fieldErrors.phoneNumber}
                    disabled={loading}
                  />
                </div>
                {fieldErrors.phoneNumber && (
                  <span className="dc-auth-field-error">{fieldErrors.phoneNumber}</span>
                )}
              </div>
            </>
          )}
          {mode === "login" && (
            <>
              <label>
                Username or email
                <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </>
          )}
          <button type="submit" className="dc-btn dc-btn--primary" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}
