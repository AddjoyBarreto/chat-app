import {
  describeDevice,
  fetchMe,
  fetchMyDevices,
  getDeviceIcon,
  getDeviceTitle,
  inferDeviceKind,
} from "@vaultchat/client";
import type { ListDevicesResponse } from "@vaultchat/protocol";
import { useEffect, useState } from "react";

export function SettingsPanel({
  open,
  onClose,
  token,
  username,
  currentDeviceId,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  username: string;
  currentDeviceId: number;
  onLogout: () => void;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [devices, setDevices] = useState<ListDevicesResponse["devices"]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  useEffect(() => {
    if (!open) return;
    void fetchMe(token).then((me) => {
      setEmail(me.email);
      setMemberSince(me.createdAt);
    });
    setLoadingDevices(true);
    void fetchMyDevices(token)
      .then((res) => setDevices(res.devices))
      .catch(() => setDevices([]))
      .finally(() => setLoadingDevices(false));
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

        <div className="dc-settings__body">
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
            <h3>Linked devices</h3>
            <p className="dc-settings__hint">
              Each install has its own encryption keys. This device is highlighted below.
            </p>
            {loadingDevices ? (
              <p className="dc-settings__hint">Loading devices…</p>
            ) : devices.length === 0 ? (
              <p className="dc-settings__hint">No linked devices found.</p>
            ) : (
              <ul className="dc-settings-devices">
                {devices.map((d) => {
                  const kind = inferDeviceKind(d.deviceName);
                  const isCurrent = d.deviceId === currentDeviceId;
                  return (
                    <li
                      key={d.deviceId}
                      className={`dc-settings-devices__item${isCurrent ? " dc-settings-devices__item--current" : ""}`}
                    >
                      <span className="dc-settings-devices__icon" aria-hidden>
                        {getDeviceIcon(kind)}
                      </span>
                      <div className="dc-settings-devices__info">
                        <div className="dc-settings-devices__title">
                          {getDeviceTitle(d)}
                          {isCurrent && (
                            <span className="dc-settings-devices__badge">This device</span>
                          )}
                        </div>
                        <div className="dc-settings-devices__meta">{describeDevice(d)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="dc-settings__section">
            <h3>Encryption</h3>
            <p className="dc-settings__hint">
              If messages fail to decrypt on this app, log out and sign in again to link this
              device, then ask your contact to send a new message.
            </p>
          </section>
        </div>

        <footer className="dc-settings__footer">
          <button type="button" className="dc-settings__logout" onClick={onLogout}>
            Log Out
          </button>
        </footer>
      </div>
    </div>
  );
}
