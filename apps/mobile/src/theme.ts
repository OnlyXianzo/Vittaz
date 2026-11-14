/**
 * Design tokens lifted from the browser preview (`apps/mobile/ui/src/styles.css`).
 * The preview is the visual spec; every value here has a counterpart there.
 */

export const colors = {
  bg: "#07120a",
  text: "#f2f7ee",
  muted: "#9db39a",
  lime: "#b8f23c",
  limeDark: "#0b1a07",
  card: "rgba(255,255,255,0.07)",
  cardBorder: "rgba(190,255,120,0.16)",
  amber: "#ffc861",
  amberBg: "rgba(245,165,36,0.16)",
  limeBg: "rgba(184,242,60,0.14)",
  panel: "rgba(9,22,11,0.94)",
  panelBorder: "rgba(190,255,120,0.18)",
  hairline: "rgba(255,255,255,0.08)",
  ghost: "rgba(255,255,255,0.07)",
  ghostBorder: "rgba(255,255,255,0.18)",
  chip: "rgba(255,255,255,0.08)",
  toastBg: "#102412",
  dim: "#6f866c",
} as const;

/** Radial CSS gradients are approximated with linear ones plus soft blobs. */
export const gradients = {
  screen: ["#2f6212", "#0d2110", "#07120a"] as const,
  hero: ["rgba(184,242,60,0.20)", "rgba(255,255,255,0.05)"] as const,
  soft: ["rgba(184,242,60,0.16)", "rgba(255,255,255,0.05)"] as const,
  cta: ["#d3fb6b", "#8fd62a", "#4fc48a"] as const,
  bubble: ["#d3fb6b", "#8fd62a"] as const,
};

export const radii = {
  card: 22,
  chip: 999,
  tile: 14,
  logo: 10,
  nav: 24,
  steps: 18,
} as const;

export const fonts = {
  regular: "PlusJakartaSans_500Medium",
  semi: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  heavy: "PlusJakartaSans_800ExtraBold",
} as const;

export type FontWeight = keyof typeof fonts;

export const space = {
  unit: 4,
  controlGap: 8,
  sectionGap: 24,
  touchTarget: 48,
  screenX: 20,
  screenTop: 28,
  card: 16,
  gap: 12,
  navHeight: 64,
  navInset: 14,
} as const;
