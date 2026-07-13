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

export function IconPhone({ className, size = 24 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" />
    </Svg>
  );
}

export function IconPhoneHangup({ className, size = 24 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.69 7.46 7 12 7s8.66 1.69 11.71 4.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28a11.3 11.3 0 0 0-2.67-1.85.96.96 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
    </Svg>
  );
}

export function IconMic({ className, size = 22 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </Svg>
  );
}

export function IconMicOff({ className, size = 22 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M19 11h-1.7c0 .58-.1 1.13-.27 1.64l1.27 1.27c.44-.88.7-1.87.7-2.91zm-6 0c0-.26-.02-.51-.06-.75l-4.19-4.19C8.91 5.55 9.4 5 10 5c1.66 0 3 1.34 3 3v3zM4.41 2.86 3 4.27l6 6V11c0 1.66 1.34 3 3 3 .23 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21l1.41-1.41L4.41 2.86z" />
    </Svg>
  );
}

export function IconVideo({ className, size = 22 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
    </Svg>
  );
}

export function IconVideoOff({ className, size = 22 }: IconProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2 2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z" />
    </Svg>
  );
}
