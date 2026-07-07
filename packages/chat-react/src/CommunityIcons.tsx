import type { ReactNode } from "react";
import type { ChannelType } from "@vaultchat/protocol";

interface IconProps {
  className?: string;
  size?: number;
}

function Svg({
  className,
  size = 16,
  children,
  viewBox = "0 0 24 24",
}: IconProps & { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconChevronLeft({ className, size = 16 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </Svg>
  );
}

export function IconChevronDown({ className, size = 12 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
    </Svg>
  );
}

export function IconPlus({ className, size = 16 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </Svg>
  );
}

export function IconSettings({ className, size = 16 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.63-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54a7.02 7.02 0 0 0-1.63.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.63.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.6-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
    </Svg>
  );
}

export function IconFolder({ className, size = 16 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </Svg>
  );
}

export function IconInvite({ className, size = 16 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </Svg>
  );
}

export function IconLock({ className, size = 12 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
    </Svg>
  );
}

export function IconClose({ className, size = 16 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </Svg>
  );
}

export function IconTrash({ className, size = 16 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </Svg>
  );
}

export function IconKey({ className, size = 16 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
    </Svg>
  );
}

export function IconSend({ className, size = 18 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </Svg>
  );
}

export function IconHash({ className, size = 20 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M7.41 10.59 8.83 6H5V4h4.24l1.41-4h2.01L11.24 4H16V6h-3.75l-1.41 4H16v2h-4.17l-1.41 4H16v2h-4.75l-1.41 4H8.83l1.41-4H5v-2h3.75zM9.83 10.59 11.24 6h2.01l-1.41 4.59H9.83z" />
    </Svg>
  );
}

export function IconVoice({ className, size = 20 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15a.996.996 0 0 0-.98-.85c-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
    </Svg>
  );
}

export function IconAnnouncement({ className, size = 20 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21.48 2.87-.74l2.04-3.87H6.05l2.04 3.87c.66 1.22 1.91 1.45 2.87.74L12 23l-2-2.39zM4 6H2v14c0 1.1.9 2 2 2h3v-2H4V6zm22-4H2C.9 2 0 2.9 0 4v12c0 1.1.9 2 2 2h22c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </Svg>
  );
}

export function ChannelTypeIcon({
  type,
  className,
  size = 20,
}: {
  type: ChannelType;
  className?: string;
  size?: number;
}) {
  if (type === "voice") return <IconVoice className={className} size={size} />;
  if (type === "announcement") return <IconAnnouncement className={className} size={size} />;
  return <IconHash className={className} size={size} />;
}
