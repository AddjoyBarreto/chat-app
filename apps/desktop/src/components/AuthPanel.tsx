import { useState } from "react";
import {
  normalizeRegistrationFields,
  validateRegistrationFields,
  type NormalizedRegistrationFields,
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
  const [phone, setPhone] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "login") {
      onLogin(identifier, password);
      return;
    }
    const errors = validateRegistrationFields({
      username,
      email,
      password,
      phoneCountry: "US",
      phoneNumber: phone,
    });
    if (Object.keys(errors).length > 0) return;
    onRegister(
      normalizeRegistrationFields({
        username,
        email,
        password,
        phoneCountry: "US",
        phoneNumber: phone,
      })
    );
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
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === "register" ? "dc-auth-tabs__active" : ""}
            onClick={() => setMode("register")}
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
                <input value={username} onChange={(e) => setUsername(e.target.value)} />
              </label>
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                Phone
                <input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
            </>
          )}
          {mode === "login" && (
            <label>
              Username or email
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </label>
          )}
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="dc-btn dc-btn--primary" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}
