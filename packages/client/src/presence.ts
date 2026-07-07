import type { PresenceStatus, SettablePresenceStatus } from "@vaultchat/protocol";

export interface PresenceOption {
  value: SettablePresenceStatus;
  label: string;
  description: string;
  icon: string;
}

export const PRESENCE_OPTIONS: PresenceOption[] = [
  { value: "online", label: "Online", description: "Active and available", icon: "🟢" },
  { value: "idle", label: "Away", description: "Idle or away from keyboard", icon: "🌙" },
  { value: "busy", label: "Do not disturb", description: "Mute notifications", icon: "⛔" },
  { value: "invisible", label: "Invisible", description: "Appear offline to others", icon: "⚫" },
];

export function presenceLabel(status: PresenceStatus): string {
  switch (status) {
    case "online":
      return "Online";
    case "idle":
      return "Away";
    case "busy":
      return "Do not disturb";
    case "invisible":
      return "Invisible";
    default:
      return "Offline";
  }
}

export function isPresenceActive(status: PresenceStatus): boolean {
  return status === "online" || status === "idle" || status === "busy";
}

export function presenceCssClass(status: PresenceStatus): string {
  switch (status) {
    case "online":
      return "vc-presence--online";
    case "idle":
      return "vc-presence--idle";
    case "busy":
      return "vc-presence--busy";
    default:
      return "vc-presence--offline";
  }
}

export function presenceColor(status: PresenceStatus): string {
  switch (status) {
    case "online":
      return "#23a559";
    case "idle":
      return "#f0b232";
    case "busy":
      return "#f23f43";
    default:
      return "#80848e";
  }
}
