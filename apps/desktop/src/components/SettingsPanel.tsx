import { fetchMe } from "@vaultchat/client";
import { useEffect, useState } from "react";

export function SettingsPanel({
  open,
  onClose,
  token,
  username,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  username: string;
  onLogout: () => void;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetchMe(token).then((me) => {
      setEmail(me.email);
      setMemberSince(me.createdAt);
    });
  }, [open, token]);

  if (!open) return null;

  return (
    <div className="dc-settings-backdrop" onClick={onClose} role="presentation">
      <div
        className="dc-settings"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="dc-settings-title"
      >
        <header className="dc-settings__header">
          <h2 id="dc-settings-title">User Settings</h2>
          <button type="button" className="dc-settings__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <section className="dc-settings__section">
          <h3>My Account</h3>
          <div className="dc-settings__row">
            <span className="dc-settings__label">Username</span>
            <span>@{username}</span>
          </div>
          {email && (
            <div className="dc-settings__row">
              <span className="dc-settings__label">Email</span>
              <span>{email}</span>
            </div>
          )}
          {memberSince && (
            <div className="dc-settings__row">
              <span className="dc-settings__label">Member since</span>
              <span>
                {new Date(memberSince).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </section>

        <section className="dc-settings__section">
          <h3>Encryption</h3>
          <p className="dc-settings__hint">
            Each device has its own encryption keys. If messages fail to decrypt on this app,
            log out and sign in again to link this device, then ask your contact to send a new
            message.
          </p>
        </section>

        <footer className="dc-settings__footer">
          <button type="button" className="dc-settings__logout" onClick={onLogout}>
            Log Out
          </button>
        </footer>
      </div>
    </div>
  );
}
