import { PRESENCE_OPTIONS, presenceLabel } from "@vaultchat/client";
import type { SettablePresenceStatus } from "@vaultchat/protocol";
import { PresenceDot } from "@vaultchat/chat-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function UserRailPanel({
  username,
  presence,
  onPresenceChange,
  onOpenSettings,
  disabled,
}: {
  username: string;
  presence: SettablePresenceStatus;
  onPresenceChange: (status: SettablePresenceStatus) => void;
  onOpenSettings: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ left: 0, bottom: 0 });

  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setMenuPos({
        left: rect.right + 10,
        bottom: Math.max(8, window.innerHeight - rect.bottom),
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          className="dc-rail-user-menu"
          style={{ left: menuPos.left, bottom: menuPos.bottom }}
          role="dialog"
          aria-label="Set your status"
        >
          <div className="dc-rail-user-menu__header">
            <span className="dc-rail-user-menu__avatar">{username[0]?.toUpperCase()}</span>
            <div>
              <strong className="dc-rail-user-menu__name">{username}</strong>
              <span className="dc-rail-user-menu__status">{presenceLabel(presence)}</span>
            </div>
          </div>

          <div className="dc-rail-user-menu__section-title">Set status</div>
          <ul className="dc-rail-user-menu__list" role="listbox">
            {PRESENCE_OPTIONS.map((opt) => {
              const selected = opt.value === presence;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`dc-rail-user-menu__option${selected ? " dc-rail-user-menu__option--active" : ""}`}
                    disabled={disabled}
                    onClick={() => {
                      onPresenceChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span className="dc-rail-user-menu__option-icon" aria-hidden>
                      {opt.icon}
                    </span>
                    <span className="dc-rail-user-menu__option-text">
                      <strong>{opt.label}</strong>
                      <small>{opt.description}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="dc-rail-user-menu__settings"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            User Settings
          </button>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`dc-rail-user${open ? " dc-rail-user--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={`@${username} — ${presenceLabel(presence)}`}
        aria-label="Open status menu"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="dc-rail-user__avatar">{username[0]?.toUpperCase()}</span>
        <PresenceDot status={presence} className="dc-rail-user__presence" />
      </button>
      {menu}
    </>
  );
}
