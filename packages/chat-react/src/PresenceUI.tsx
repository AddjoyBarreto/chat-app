import { PRESENCE_OPTIONS, presenceCssClass, presenceLabel } from "@vaultchat/client";
import type { PresenceStatus, SettablePresenceStatus } from "@vaultchat/protocol";
import { useEffect, useRef, useState } from "react";

export function PresenceDot({
  status,
  className = "",
  title,
}: {
  status: PresenceStatus;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`vc-presence-dot ${presenceCssClass(status)}${className ? ` ${className}` : ""}`}
      title={title ?? presenceLabel(status)}
      aria-label={title ?? presenceLabel(status)}
    />
  );
}

export function PresencePicker({
  value,
  onChange,
  disabled,
  className = "",
  align = "left",
}: {
  value: SettablePresenceStatus;
  onChange: (status: SettablePresenceStatus) => void;
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = PRESENCE_OPTIONS.find((o) => o.value === value) ?? PRESENCE_OPTIONS[0]!;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div
      className={`vc-presence-picker${className ? ` ${className}` : ""}${align === "right" ? " vc-presence-picker--right" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="vc-presence-picker__trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <PresenceDot status={value} className="vc-presence-picker__dot" />
        <span className="vc-presence-picker__label">{current.label}</span>
        <span className="vc-presence-picker__caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="vc-presence-picker__menu" role="dialog" aria-label="Set your status">
          <div className="vc-presence-picker__menu-header">Set status</div>
          <ul className="vc-presence-picker__list" role="listbox">
            {PRESENCE_OPTIONS.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className={`vc-presence-picker__option${opt.value === value ? " vc-presence-picker__option--active" : ""}`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span className="vc-presence-picker__option-icon" aria-hidden>
                    {opt.icon}
                  </span>
                  <span className="vc-presence-picker__option-text">
                    <strong>{opt.label}</strong>
                    <small>{opt.description}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
