"use client";

import {
  clampMessageText,
  hasMarkdownSyntax,
  MAX_MESSAGE_TEXT_LENGTH,
} from "@vaultchat/client";
import type { ChangeEvent, KeyboardEvent } from "react";
import { MarkdownText } from "./MarkdownText.js";

export function MarkdownComposerField({
  value,
  onChange,
  placeholder,
  disabled,
  maxLength = MAX_MESSAGE_TEXT_LENGTH,
  className,
  fieldClassName = "vc-composer-field",
  inputClassName = "vc-composer__input",
  rows = 1,
  onKeyDown,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  /** Extra class on the outer field wrapper */
  className?: string;
  /** Base class for the field wrapper (use dc-composer-field on desktop) */
  fieldClassName?: string;
  inputClassName?: string;
  rows?: number;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Enter without Shift sends when the trimmed value is non-empty. */
  onSubmit?: () => void;
}) {
  const showPreview = hasMarkdownSyntax(value);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (!onSubmit || e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (disabled || !value.trim()) return;
    onSubmit();
  }

  return (
    <div
      className={`${fieldClassName}${showPreview ? ` ${fieldClassName}--preview` : ""}${className ? ` ${className}` : ""}`}
    >
      <textarea
        className={inputClassName}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(clampMessageText(e.target.value))
        }
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        disabled={disabled}
      />
      {showPreview ? (
        <div className={`${fieldClassName}__preview`} aria-live="polite">
          <span className={`${fieldClassName}__preview-label`}>Preview</span>
          <MarkdownText text={value} className={`${fieldClassName}__preview-body`} />
        </div>
      ) : null}
    </div>
  );
}
