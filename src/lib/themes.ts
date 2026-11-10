/**
 * Colour themes. Every theme defines the same set of tokens; components only
 * use `var(--token)`, never raw colours. Pure data (no Svelte/Tauri) so the
 * contrast tests can check that every theme is readable.
 */

export type ThemeId = "light" | "dark" | "sepia" | "midnight" | "contrast";

export const THEME_TOKENS = [
  "bg", "bg-panel", "bg-sidebar", "border",
  "text", "text-muted", "text-faint",
  "accent", "accent-soft", "on-accent",
  "danger", "danger-bg",
  "warn-fg", "warn-bg", "warn-bg-soft", "warn-border",
  "ok-fg", "ok-bg", "del-fg", "del-bg",
  "char", "char-fg", "char-bg", "place", "place-fg", "place-bg",
  "mark-bg", "mark-fg", "mark-ring",
  "backdrop",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type Palette = Record<ThemeToken, string>;

export type ThemeInfo = {
  /** Built-in ids are ThemeId; imported themes are "user:<slug>". */
  id: string;
  label: string;
  dark: boolean;
  palette: Palette;
  /** Group this theme belongs to ("Gallery", the name of an imported folder…). Built-in themes have none. */
  collection?: string;
};

const light: Palette = {
  "bg": "#f8fafc", "bg-panel": "#ffffff", "bg-sidebar": "#f1f5f9", "border": "#e2e8f0",
  "text": "#0f172a", "text-muted": "#586579", "text-faint": "#8391a5",
  "accent": "#1d4ed8", "accent-soft": "#dbeafe", "on-accent": "#ffffff",
  "danger": "#b91c1c", "danger-bg": "#fef2f2",
  "warn-fg": "#92400e", "warn-bg": "#fef3c7", "warn-bg-soft": "#fffbeb", "warn-border": "#fde68a",
  "ok-fg": "#14532d", "ok-bg": "#dcfce7", "del-fg": "#7f1d1d", "del-bg": "#fee2e2",
  "char": "#3b82f6", "char-fg": "#1d4ed8", "char-bg": "#dbeafe",
  "place": "#16a34a", "place-fg": "#15803d", "place-bg": "#dcfce7",
  "mark-bg": "#fde68a", "mark-fg": "#451a03", "mark-ring": "#f59e0b",
  "backdrop": "rgba(15, 23, 42, 0.35)",
};

const dark: Palette = {
  "bg": "#0b1220", "bg-panel": "#111a2b", "bg-sidebar": "#0f1726", "border": "#26344d",
  "text": "#e5e9f0", "text-muted": "#9aa8bd", "text-faint": "#6f7f96",
  "accent": "#60a5fa", "accent-soft": "#1e3a5f", "on-accent": "#0b1220",
  "danger": "#f87171", "danger-bg": "#3b1219",
  "warn-fg": "#fcd34d", "warn-bg": "#3a2e0b", "warn-bg-soft": "#2b230a", "warn-border": "#6b5314",
  "ok-fg": "#86efac", "ok-bg": "#123524", "del-fg": "#fca5a5", "del-bg": "#451a1a",
  "char": "#60a5fa", "char-fg": "#93c5fd", "char-bg": "#1e3a5f",
  "place": "#4ade80", "place-fg": "#86efac", "place-bg": "#123524",
  "mark-bg": "#facc15", "mark-fg": "#1c1100", "mark-ring": "#fde047",
  "backdrop": "rgba(0, 0, 0, 0.6)",
};

const sepia: Palette = {
  "bg": "#f4ecd8", "bg-panel": "#fbf5e6", "bg-sidebar": "#ede3cb", "border": "#d9cba8",
  "text": "#3b2f1e", "text-muted": "#66543b", "text-faint": "#8f7d5e",
  "accent": "#8a4b14", "accent-soft": "#ecd9b5", "on-accent": "#fffaf0",
  "danger": "#9b1c1c", "danger-bg": "#f6dcd3",
  "warn-fg": "#6b3e07", "warn-bg": "#f0dcae", "warn-bg-soft": "#f5e8c6", "warn-border": "#d8bf7c",
  "ok-fg": "#1f4d2b", "ok-bg": "#d9e6c3", "del-fg": "#7a1d1d", "del-bg": "#f1cfc4",
  "char": "#2b5ea7", "char-fg": "#1e4a8a", "char-bg": "#dde5ee",
  "place": "#2f7a3d", "place-fg": "#25622f", "place-bg": "#d9e6c3",
  "mark-bg": "#f2c94c", "mark-fg": "#3a2600", "mark-ring": "#c58a00",
  "backdrop": "rgba(59, 47, 30, 0.4)",
};

const midnight: Palette = {
  ...dark,
  "bg": "#07070c", "bg-panel": "#101017", "bg-sidebar": "#0b0b11", "border": "#272733",
  "text": "#e8e8f0", "text-muted": "#a2a2b6", "text-faint": "#71718a",
  "accent": "#a78bfa", "accent-soft": "#2d2554", "on-accent": "#0a0a0f",
};

const contrast: Palette = {
  "bg": "#ffffff", "bg-panel": "#ffffff", "bg-sidebar": "#f0f0f0", "border": "#1a1a1a",
  "text": "#000000", "text-muted": "#2b2b2b", "text-faint": "#595959",
  "accent": "#0000cc", "accent-soft": "#d6e0ff", "on-accent": "#ffffff",
  "danger": "#a00000", "danger-bg": "#ffe3e3",
  "warn-fg": "#5c2d00", "warn-bg": "#ffe9a8", "warn-bg-soft": "#fff4cf", "warn-border": "#8a5a00",
  "ok-fg": "#003d14", "ok-bg": "#c9f2d5", "del-fg": "#5c0000", "del-bg": "#ffd0d0",
  "char": "#0000cc", "char-fg": "#00008a", "char-bg": "#d6e0ff",
  "place": "#006b25", "place-fg": "#004d1a", "place-bg": "#c9f2d5",
  "mark-bg": "#ffe14d", "mark-fg": "#000000", "mark-ring": "#000000",
  "backdrop": "rgba(0, 0, 0, 0.55)",
};

export const THEMES: ThemeInfo[] = [
  { id: "light", label: "Light", dark: false, palette: light },
  { id: "dark", label: "Dark", dark: true, palette: dark },
  { id: "sepia", label: "Sepia", dark: false, palette: sepia },
  { id: "midnight", label: "Midnight", dark: true, palette: midnight },
  { id: "contrast", label: "High contrast", dark: false, palette: contrast },
];

export const themeById = (id: string): ThemeInfo =>
  THEMES.find((t) => t.id === id) ?? THEMES[0];

// ─── contrast (WCAG 2.x) ──────────────────────────────────────

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ─── readability report ───────────────────────────────────────

/** [foreground token, background token, minimum contrast] - what every theme must satisfy. */
export const CONTRAST_RULES: [ThemeToken, ThemeToken, number][] = [
  ["text", "bg", 7], ["text", "bg-panel", 7], ["text", "bg-sidebar", 7],
  ["text-muted", "bg", 4.5], ["text-muted", "bg-panel", 4.5], ["text-muted", "bg-sidebar", 4.5],
  ["text-faint", "bg-panel", 3],
  ["on-accent", "accent", 4.5], ["accent", "bg-panel", 3], ["accent", "accent-soft", 4.5],
  ["danger", "bg-panel", 4.5], ["danger", "danger-bg", 4.5],
  ["warn-fg", "warn-bg", 4.5], ["warn-fg", "warn-bg-soft", 4.5],
  ["ok-fg", "ok-bg", 4.5], ["del-fg", "del-bg", 4.5],
  ["char-fg", "char-bg", 4.5], ["place-fg", "place-bg", 4.5],
  ["mark-fg", "mark-bg", 7],
];

/** Human-readable list of the contrast rules a palette breaks (empty = fully readable). */
export function contrastReport(p: Palette): string[] {
  const out: string[] = [];
  for (const [fg, bg, min] of CONTRAST_RULES) {
    const r = contrastRatio(p[fg], p[bg]);
    if (r < min) out.push(`${fg} on ${bg} = ${r.toFixed(2)} (needs ${min})`);
  }
  return out;
}

/** Is this value a complete palette of #rrggbb colours (plus the backdrop)? */
export function isPalette(v: unknown): v is Palette {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return THEME_TOKENS.every((t) =>
    typeof r[t] === "string" && (t === "backdrop" ? true : /^#[0-9a-f]{6}$/i.test(r[t] as string))
  );
}
