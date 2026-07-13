"use client";

import { presenceLabel } from "@vaultchat/client";
import type { GroupMemberInfo, PresenceStatus } from "@vaultchat/protocol";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { OverlayPortal } from "./OverlayPortal.js";
import { PresenceDot } from "./PresenceUI.js";

export interface MemberProfilePopoutProps {
  member: GroupMemberInfo;
  status: PresenceStatus;
  isSelf: boolean;
  isViewerAdmin: boolean;
  isFriend: boolean;
  /** Preferred screen position (from click). Falls back to centered. */
  anchor?: { top: number; left: number; bottom?: number } | null;
  onClose: () => void;
  onMessage: (userId: string, username: string, draft?: string) => void;
  onAddFriend?: () => void | Promise<void>;
  onBlock?: () => void | Promise<void>;
  onKick?: () => void | Promise<void>;
  onPromote?: () => void | Promise<void>;
  onDemote?: () => void | Promise<void>;
  onShareKey?: () => void | Promise<void>;
}

export function MemberProfilePopout({
  member,
  status,
  isSelf,
  isViewerAdmin,
  isFriend,
  anchor,
  onClose,
  onMessage,
  onAddFriend,
  onBlock,
  onKick,
  onPromote,
  onDemote,
  onShareKey,
}: MemberProfilePopoutProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: PointerEvent) {
      if (busy) return;
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose, busy]);

  const style =
    anchor != null
      ? {
          top: Math.min(anchor.top, typeof window !== "undefined" ? window.innerHeight - 420 : anchor.top),
          left: Math.min(
            Math.max(12, anchor.left - 340),
            typeof window !== "undefined" ? window.innerWidth - 352 : anchor.left
          ),
        }
      : undefined;

  async function run(action?: () => void | Promise<void>) {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setMenuOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleMessageSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    onMessage(member.userId, member.username, text || undefined);
    setDraft("");
    onClose();
  }

  function stop(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <OverlayPortal>
      <div className="vc-member-popout-layer" role="presentation" onMouseDown={stop}>
        <div
          ref={rootRef}
          className={`vc-member-popout${anchor ? " vc-member-popout--anchored" : ""}`}
          style={style}
          role="dialog"
          aria-label={`@${member.username}`}
        >
          <div className="vc-member-popout__banner">
            <div className="vc-member-popout__banner-actions">
              <button
                type="button"
                className="vc-member-popout__icon-btn"
                aria-label="More options"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                disabled={busy}
              >
                ···
              </button>
            </div>
            {menuOpen && (
              <div className="vc-member-popout__menu" role="menu">
                {!isSelf && (
                  <button
                    type="button"
                    role="menuitem"
                    className="vc-member-popout__menu-item"
                    onClick={() => {
                      onMessage(member.userId, member.username);
                      onClose();
                    }}
                  >
                    Message
                  </button>
                )}
                {!isSelf && !isFriend && onAddFriend && (
                  <button
                    type="button"
                    role="menuitem"
                    className="vc-member-popout__menu-item"
                    onClick={() => void run(onAddFriend)}
                  >
                    Add Friend
                  </button>
                )}
                {isViewerAdmin && !isSelf && member.role !== "admin" && onPromote && (
                  <button
                    type="button"
                    role="menuitem"
                    className="vc-member-popout__menu-item"
                    onClick={() => void run(onPromote)}
                  >
                    Make Admin
                  </button>
                )}
                {!isSelf && member.role === "admin" && onDemote && (
                  <button
                    type="button"
                    role="menuitem"
                    className="vc-member-popout__menu-item"
                    onClick={() => void run(onDemote)}
                  >
                    Remove Admin
                  </button>
                )}
                {isViewerAdmin && !isSelf && onShareKey && (
                  <button
                    type="button"
                    role="menuitem"
                    className="vc-member-popout__menu-item"
                    onClick={() => void run(onShareKey)}
                  >
                    Share encryption key
                  </button>
                )}
                {(onBlock || onKick) && <div className="vc-member-popout__menu-sep" />}
                {!isSelf && onBlock && (
                  <button
                    type="button"
                    role="menuitem"
                    className="vc-member-popout__menu-item vc-member-popout__menu-item--danger"
                    onClick={() => void run(onBlock)}
                  >
                    Block
                  </button>
                )}
                {isViewerAdmin && !isSelf && member.role !== "admin" && onKick && (
                  <button
                    type="button"
                    role="menuitem"
                    className="vc-member-popout__menu-item vc-member-popout__menu-item--danger"
                    onClick={() => void run(onKick)}
                  >
                    Remove from server
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="vc-member-popout__body">
            <div className="vc-member-popout__avatar-wrap">
              <div className="vc-member-popout__avatar" aria-hidden>
                {member.username[0]?.toUpperCase() ?? "?"}
              </div>
              <PresenceDot status={status} className="vc-member-popout__presence" />
            </div>

            <div className="vc-member-popout__identity">
              <strong className="vc-member-popout__display">{member.username}</strong>
              <span className="vc-member-popout__username">@{member.username}</span>
              <span className="vc-member-popout__status-line">{presenceLabel(status)}</span>
            </div>

            <div className="vc-member-popout__roles">
              <span className="vc-member-popout__roles-label">Roles</span>
              <div className="vc-member-popout__role-row">
                {member.role === "admin" ? (
                  <span className="vc-member-popout__role">Admin</span>
                ) : (
                  <span className="vc-member-popout__role vc-member-popout__role--member">Member</span>
                )}
                {isViewerAdmin && !isSelf && member.role !== "admin" && onPromote && (
                  <button
                    type="button"
                    className="vc-member-popout__add-role"
                    onClick={() => void run(onPromote)}
                    disabled={busy}
                  >
                    + Make admin
                  </button>
                )}
                {!isSelf && member.role === "admin" && onDemote && (
                  <button
                    type="button"
                    className="vc-member-popout__add-role"
                    onClick={() => void run(onDemote)}
                    disabled={busy}
                  >
                    Remove admin
                  </button>
                )}
              </div>
            </div>

            {error && (
              <p className="vc-member-popout__error" role="alert">
                {error}
              </p>
            )}

            {!isSelf && (
              <form className="vc-member-popout__compose" onSubmit={handleMessageSubmit}>
                <input
                  className="vc-member-popout__compose-input"
                  placeholder={`Message @${member.username}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={2000}
                  autoFocus
                />
                <button type="submit" className="vc-member-popout__compose-send" aria-label="Send">
                  ➤
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
