"use client";

import {
  fetchBlocks,
  fetchMyDevices,
  fetchPrivacySettings,
  unblockUser,
  updatePrivacySettings,
  type DmPolicy,
} from "@vaultchat/client";
import type { BlockInfo, ListDevicesResponse, MeResponse, PrivacySettingsResponse } from "@vaultchat/protocol";
import { useCallback, useEffect, useState } from "react";
import { fetchMe, resendVerificationEmail } from "@/lib/client-api";
import { friendlyError } from "@/lib/errors";
import { applyTheme, getStoredTheme, THEME_OPTIONS, type ThemeId } from "@/lib/theme";

type SettingsSection = "account" | "privacy" | "appearance" | "devices";

const NAV: { id: SettingsSection; label: string }[] = [
  { id: "account", label: "My Account" },
  { id: "privacy", label: "Privacy & Safety" },
  { id: "appearance", label: "Appearance" },
  { id: "devices", label: "Devices" },
];

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  username: string;
  onLogout: () => void;
  onShowToast?: (message: string, type?: "info" | "error") => void;
}

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatPhone(code: string, number: string): string {
  return `${code} ${number.replace(/(\d{3})(?=\d)/g, "$1 ").trim()}`;
}

export function SettingsModal({
  open,
  onClose,
  token,
  username,
  onLogout,
  onShowToast,
}: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>("account");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettingsResponse | null>(null);
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const [devices, setDevices] = useState<ListDevicesResponse["devices"]>([]);
  const [theme, setTheme] = useState<ThemeId>("default");
  const [loading, setLoading] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  const toast = useCallback(
    (message: string, type: "info" | "error" = "info") => {
      onShowToast?.(message, type);
    },
    [onShowToast]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, privacyRes, blocksRes, devicesRes] = await Promise.all([
        fetchMe(token),
        fetchPrivacySettings(token),
        fetchBlocks(token),
        fetchMyDevices(token),
      ]);
      setMe(meRes);
      setPrivacy(privacyRes);
      setBlocks(blocksRes.blocks);
      setDevices(devicesRes.devices);
      setTheme(getStoredTheme());
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    if (open) {
      void loadData();
      setSection("account");
    }
  }, [open, loadData]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleDmPolicyChange(policy: DmPolicy) {
    if (!privacy || privacy.dmPolicy === policy) return;
    setSavingPrivacy(true);
    try {
      const updated = await updatePrivacySettings(token, { dmPolicy: policy });
      setPrivacy(updated);
      toast("Privacy settings saved");
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function handleUnblock(userId: string) {
    try {
      await unblockUser(token, userId);
      setBlocks((prev) => prev.filter((b) => b.userId !== userId));
      toast("User unblocked");
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  async function handleResendVerification() {
    setResendingEmail(true);
    try {
      const res = await resendVerificationEmail(token);
      toast(res.message ?? "Verification email sent");
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setResendingEmail(false);
    }
  }

  function handleThemeChange(next: ThemeId) {
    setTheme(next);
    applyTheme(next);
    toast("Theme updated");
  }

  if (!open) return null;

  const displayName = me?.username ?? username;

  return (
    <div
      className="vc-settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="User settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="vc-settings__topbar">
        <button type="button" className="vc-settings__close" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
        <span className="vc-settings__topbar-title">User Settings</span>
      </div>

      <div className="vc-settings">
        <aside className="vc-settings__sidebar">
          <div className="vc-settings__user-card">
            <div className="vc-settings__user-avatar">{displayName[0]?.toUpperCase()}</div>
            <div className="vc-settings__user-name">{displayName}</div>
            <div className="vc-settings__user-handle">@{displayName}</div>
          </div>

          <div className="vc-settings__nav-group-title">User Settings</div>
          <nav className="vc-settings__nav">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`vc-settings__nav-item${
                  section === item.id ? " vc-settings__nav-item--active" : ""
                }`}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="vc-settings__sidebar-footer">
            <button type="button" className="vc-settings__logout" onClick={onLogout}>
              Log Out
            </button>
          </div>
        </aside>

        <main className="vc-settings__content">
          {loading && !me ? (
            <p className="vc-settings__loading">Loading settings…</p>
          ) : (
            <>
              {section === "account" && me && (
                <AccountSection
                  me={me}
                  resendingEmail={resendingEmail}
                  onResendVerification={() => void handleResendVerification()}
                />
              )}
              {section === "privacy" && privacy && (
                <PrivacySection
                  privacy={privacy}
                  blocks={blocks}
                  saving={savingPrivacy}
                  onDmPolicyChange={(p) => void handleDmPolicyChange(p)}
                  onUnblock={(id) => void handleUnblock(id)}
                />
              )}
              {section === "appearance" && (
                <AppearanceSection theme={theme} onThemeChange={handleThemeChange} />
              )}
              {section === "devices" && (
                <DevicesSection devices={devices} currentUsername={displayName} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function AccountSection({
  me,
  resendingEmail,
  onResendVerification,
}: {
  me: MeResponse;
  resendingEmail: boolean;
  onResendVerification: () => void;
}) {
  return (
    <div className="vc-settings-panel">
      <h2 className="vc-settings-panel__title">My Account</h2>

      <div className="vc-settings-profile">
        <div className="vc-settings-profile__avatar">{me.username[0]?.toUpperCase()}</div>
        <div>
          <div className="vc-settings-profile__name">{me.username}</div>
          <div className="vc-settings-profile__sub">Profile editing coming soon</div>
        </div>
      </div>

      <div className="vc-settings-card">
        <h3 className="vc-settings-card__title">Account details</h3>
        <dl className="vc-settings-dl">
          <div className="vc-settings-dl__row">
            <dt>Username</dt>
            <dd>@{me.username}</dd>
          </div>
          <div className="vc-settings-dl__row">
            <dt>Email</dt>
            <dd>
              <span>{me.email}</span>
              {me.emailVerified ? (
                <span className="vc-settings-badge vc-settings-badge--ok">Verified</span>
              ) : (
                <span className="vc-settings-badge vc-settings-badge--warn">Unverified</span>
              )}
            </dd>
          </div>
          <div className="vc-settings-dl__row">
            <dt>Phone</dt>
            <dd>{formatPhone(me.phoneCountryCode, me.phoneNumber)}</dd>
          </div>
          <div className="vc-settings-dl__row">
            <dt>Member since</dt>
            <dd>{formatMemberSince(me.createdAt)}</dd>
          </div>
        </dl>

        {!me.emailVerified && (
          <button
            type="button"
            className="vc-btn vc-btn--sm"
            disabled={resendingEmail}
            onClick={onResendVerification}
          >
            {resendingEmail ? "Sending…" : "Resend verification email"}
          </button>
        )}
      </div>

      <p className="vc-settings-note">
        Password and username changes are not available yet. Your messages stay end-to-end encrypted
        on each device.
      </p>
    </div>
  );
}

function PrivacySection({
  privacy,
  blocks,
  saving,
  onDmPolicyChange,
  onUnblock,
}: {
  privacy: PrivacySettingsResponse;
  blocks: BlockInfo[];
  saving: boolean;
  onDmPolicyChange: (policy: DmPolicy) => void;
  onUnblock: (userId: string) => void;
}) {
  return (
    <div className="vc-settings-panel">
      <h2 className="vc-settings-panel__title">Privacy &amp; Safety</h2>

      <div className="vc-settings-card">
        <h3 className="vc-settings-card__title">Direct messages</h3>
        <p className="vc-settings-card__desc">Choose who can start a conversation with you.</p>
        <div className="vc-settings-radio-group" role="radiogroup" aria-label="DM policy">
          <label className="vc-settings-radio">
            <input
              type="radio"
              name="dmPolicy"
              checked={privacy.dmPolicy === "everyone"}
              disabled={saving}
              onChange={() => onDmPolicyChange("everyone")}
            />
            <span className="vc-settings-radio__label">
              <strong>Everyone</strong>
              <small>Anyone can send you a message request</small>
            </span>
          </label>
          <label className="vc-settings-radio">
            <input
              type="radio"
              name="dmPolicy"
              checked={privacy.dmPolicy === "friends_only"}
              disabled={saving}
              onChange={() => onDmPolicyChange("friends_only")}
            />
            <span className="vc-settings-radio__label">
              <strong>Friends only</strong>
              <small>Only people on your friends list can DM you</small>
            </span>
          </label>
        </div>
      </div>

      <div className="vc-settings-card">
        <h3 className="vc-settings-card__title">Blocked users</h3>
        <p className="vc-settings-card__desc">
          Blocked users cannot message you. You can block someone from the Friends tab.
        </p>
        {blocks.length === 0 ? (
          <p className="vc-settings-empty-inline">You haven&apos;t blocked anyone.</p>
        ) : (
          <ul className="vc-settings-list">
            {blocks.map((b) => (
              <li key={b.userId} className="vc-settings-list__item">
                <span>@{b.username}</span>
                <button
                  type="button"
                  className="vc-btn vc-btn--ghost vc-btn--sm"
                  onClick={() => onUnblock(b.userId)}
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AppearanceSection({
  theme,
  onThemeChange,
}: {
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
}) {
  return (
    <div className="vc-settings-panel">
      <h2 className="vc-settings-panel__title">Appearance</h2>
      <p className="vc-settings-panel__lead">
        Customize how VaultChat looks on this device. Theme is saved locally.
      </p>

      <div className="vc-settings-card">
        <h3 className="vc-settings-card__title">Theme</h3>
        <div className="vc-settings-theme-grid">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`vc-settings-theme-card${
                theme === opt.id ? " vc-settings-theme-card--active" : ""
              }`}
              data-theme-preview={opt.id}
              onClick={() => onThemeChange(opt.id)}
            >
              <div className="vc-settings-theme-card__swatch" />
              <div className="vc-settings-theme-card__label">{opt.label}</div>
              <div className="vc-settings-theme-card__desc">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DevicesSection({
  devices,
  currentUsername,
}: {
  devices: ListDevicesResponse["devices"];
  currentUsername: string;
}) {
  return (
    <div className="vc-settings-panel">
      <h2 className="vc-settings-panel__title">Devices</h2>
      <p className="vc-settings-panel__lead">
        Each browser or app you log into has its own encryption keys. Messages are synced using
        device-specific copies — like Discord sessions, but encrypted.
      </p>

      <div className="vc-settings-card">
        <h3 className="vc-settings-card__title">Logged-in devices</h3>
        {devices.length === 0 ? (
          <p className="vc-settings-empty-inline">No devices found.</p>
        ) : (
          <ul className="vc-settings-list">
            {devices.map((d) => (
              <li key={d.deviceId} className="vc-settings-list__item vc-settings-list__item--stacked">
                <div>
                  <strong>{d.deviceName ?? `Device ${d.deviceId}`}</strong>
                  <div className="vc-settings-list__meta">Device ID {d.deviceId}</div>
                </div>
                <span className="vc-settings-badge vc-settings-badge--ok">Active</span>
              </li>
            ))}
          </ul>
        )}
        <p className="vc-settings-note">
          Signed in as @{currentUsername}. Remote logout for other devices is coming soon.
        </p>
      </div>
    </div>
  );
}
