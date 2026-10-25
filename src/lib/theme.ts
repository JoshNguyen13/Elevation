// Design tokens pulled from Elevation.fig. Mirrored as CSS variables in
// src/app/globals.css — keep both in sync. Canvas drawing needs the JS values.
export const colors = {
  background: "#ffffff",
  surface: "#f9f9fa",
  ink: "#000000",
  inkSoft: "#1c1c21",
  textMuted: "#6b6b73",
  textSubtle: "#8c8c91",
  border: "#e0e0e3",
  borderStrong: "#dedee3",
  platform: "#bfbfc4",
  disabled: "#b2b2b8",
  accent: "#296eed",
} as const;
