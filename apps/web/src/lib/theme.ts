export type ThemeId = "default" | "discord" | "light";

const STORAGE_KEY = "vaultchat_theme";

export function getStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "default";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "discord" || raw === "light" || raw === "default") return raw;
  return "default";
}

export function applyTheme(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.vcTheme = theme === "default" ? "" : theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

export const THEME_OPTIONS: { id: ThemeId; label: string; description: string }[] = [
  { id: "default", label: "VaultChat Dark", description: "Green accent, compact mobile feel" },
  { id: "discord", label: "Discord Dark", description: "Blurple accent, server-style panels" },
  { id: "light", label: "Light", description: "Bright panels for daytime use" },
];
