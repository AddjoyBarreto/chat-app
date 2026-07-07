export const theme = {
  bgApp: "#0b141a",
  bgPanel: "#111b21",
  bgHeader: "#202c33",
  bgInput: "#2a3942",
  bgElevated: "#1a262d",
  bgBubbleOut: "#005c4b",
  bgBubbleIn: "#202c33",
  textPrimary: "#e9edef",
  textSecondary: "#8696a0",
  textMuted: "#667781",
  accent: "#00a884",
  accentHover: "#06cf9c",
  accentMuted: "rgba(0, 168, 132, 0.12)",
  danger: "#ea4335",
  warning: "#fbbf24",
  online: "#25d366",
  border: "#222d34",
  borderFocus: "#00a884",
  overlay: "rgba(0, 0, 0, 0.65)",

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 24,
    full: 999,
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 16,
    xl: 20,
    xxl: 28,
  },
};

export const avatarColors = [
  "#6b7c85",
  "#e17076",
  "#7bc862",
  "#65aadd",
  "#a695e7",
  "#ee7aae",
  "#6ec9cb",
  "#faa774",
  "#5dca88",
];

export function avatarColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length]!;
}
