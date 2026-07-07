import type { ChannelType } from "@vaultchat/protocol";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { theme } from "@/theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface IconProps {
  size?: number;
  color?: string;
}

function Icon({ name, size = 18, color = theme.textMuted }: IconProps & { name: IconName }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

export function IconChevronLeft({ size = 22, color = theme.textPrimary }: IconProps) {
  return <Icon name="chevron-left" size={size} color={color} />;
}

export function IconChevronDown({ size = 12, color = theme.textMuted }: IconProps) {
  return <Icon name="chevron-down" size={size} color={color} />;
}

export function IconChevronRight({ size = 12, color = theme.textMuted }: IconProps) {
  return <Icon name="chevron-right" size={size} color={color} />;
}

export function IconLock({ size = 12, color = theme.textMuted }: IconProps) {
  return <Icon name="lock" size={size} color={color} />;
}

export function IconSend({ size = 20, color = theme.bgApp }: IconProps) {
  return <Icon name="send" size={size} color={color} />;
}

export function IconClose({ size = 18, color = theme.textSecondary }: IconProps) {
  return <Icon name="close" size={size} color={color} />;
}

export function IconAccountGroup({ size = 22, color = theme.textPrimary }: IconProps) {
  return <Icon name="account-group" size={size} color={color} />;
}

export function IconVoice({ size = 22, color = theme.textMuted }: IconProps) {
  return <Icon name="microphone" size={size} color={color} />;
}

export function IconHash({ size = 20, color = theme.textMuted }: IconProps) {
  return <Icon name="pound" size={size} color={color} />;
}

export function IconAnnouncement({ size = 20, color = theme.textMuted }: IconProps) {
  return <Icon name="bullhorn" size={size} color={color} />;
}

export function ChannelTypeIcon({
  type,
  size = 18,
  color = theme.textMuted,
}: {
  type: ChannelType;
  size?: number;
  color?: string;
}) {
  if (type === "voice") return <IconVoice size={size} color={color} />;
  if (type === "announcement") return <IconAnnouncement size={size} color={color} />;
  return <IconHash size={size} color={color} />;
}
