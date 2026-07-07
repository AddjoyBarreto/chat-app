import type { UserDeviceInfo } from "@vaultchat/protocol";

export type DeviceKind = "web" | "desktop" | "ios" | "android" | "primary" | "unknown";

export function inferDeviceKind(deviceName?: string): DeviceKind {
  const name = (deviceName ?? "").trim().toLowerCase();
  if (name === "web") return "web";
  if (name === "desktop") return "desktop";
  if (name === "ios") return "ios";
  if (name === "android") return "android";
  if (name === "primary") return "primary";
  return "unknown";
}

export function getDeviceKindLabel(kind: DeviceKind): string {
  switch (kind) {
    case "web":
      return "Web browser";
    case "desktop":
      return "Desktop app";
    case "ios":
      return "iPhone / iPad";
    case "android":
      return "Android phone";
    case "primary":
      return "Primary device";
    default:
      return "Linked device";
  }
}

export function getDeviceIcon(kind: DeviceKind): string {
  switch (kind) {
    case "web":
      return "🌐";
    case "desktop":
      return "💻";
    case "ios":
    case "android":
      return "📱";
    case "primary":
      return "🔑";
    default:
      return "📟";
  }
}

export function getDeviceTitle(device: UserDeviceInfo): string {
  const kind = inferDeviceKind(device.deviceName);
  if (kind !== "unknown" && kind !== "primary") {
    if (kind === "ios") return "iOS";
    if (kind === "android") return "Android";
    return device.deviceName!.charAt(0).toUpperCase() + device.deviceName!.slice(1).toLowerCase();
  }
  if (device.deviceName && !["Device", "Primary"].includes(device.deviceName)) {
    return device.deviceName;
  }
  return `Device ${device.deviceId}`;
}

export function formatDeviceLinkedAt(iso?: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function describeDevice(device: UserDeviceInfo): string {
  const kind = inferDeviceKind(device.deviceName);
  const parts = [getDeviceKindLabel(kind)];
  const linked = formatDeviceLinkedAt(device.createdAt);
  if (linked) parts.push(`Linked ${linked}`);
  parts.push(`ID ${device.deviceId}`);
  return parts.join(" · ");
}
