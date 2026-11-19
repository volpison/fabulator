/**
 * Build a complete, readable theme palette from a handful of base colours.
 *
 * Imported themes (Base16, VS Code, hand-written JSON…) only tell us a few
 * colours. Everything else is derived, and every text/background pair is
 * nudged until it meets the same contrast rules the built-in themes pass
 * (CONTRAST_RULES), so an imported theme can never be unreadable.
 *
 * Pure (no Svelte/Tauri), unit-tested.
 */
import { contrastRatio, luminance, type Palette } from "./themes";

// ─── colour math ──────────────────────────────────────────────

export type RGB = [number, number, number];

/** "#rgb", "#rrggbb" or the same without "#" -> "#rrggbb" (lower case), or null. */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** a*(1-t) + b*t, per channel. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

const worst = (color: string, against: string[]) =>
  Math.min(...against.map((bg) => contrastRatio(color, bg)));

/**
 * Move `color` towards white (on dark backgrounds) or black (on light ones)
 * until it has at least `min` contrast against every colour in `against`.
 * Returns the colour unchanged if it already passes.
 */
export function ensureContrast(color: string, against: string[], min: number): string {
  if (worst(color, against) >= min) return color;
  const avg = against.reduce((n, c) => n + luminance(c), 0) / against.length;
  const target = avg < 0.4 ? "#ffffff" : "#000000";
  for (let t = 0.04; t <= 1.0001; t += 0.04) {
    const c = mix(color, target, t);
    if (worst(c, against) >= min) return c;
  }
  // Mixed light/dark backgrounds: take whichever extreme is best.
  return worst("#ffffff", against) >= worst("#000000", against) ? "#ffffff" : "#000000";
}

// ─── spec -> palette ──────────────────────────────────────────

/** The base colours a theme author provides. All #rrggbb. Only the first three are required. */
export type BaseColors = {
  background: string;
  foreground: string;
  accent: string;
  panel?: string;
  sidebar?: string;
  border?: string;
  muted?: string;
  danger?: string;
  success?: string;
  warning?: string;
  /** Underline colour for character names. */
  character?: string;
  /** Underline colour for place names. */
  place?: string;
  /** Search / replace highlight. */
  highlight?: string;
};

export function buildPalette(base: BaseColors, dark: boolean, overrides: Partial<Palette> = {}): Palette {
  const fg = base.foreground;

  // Surfaces: on dark themes panels sit above the page, on light themes they are brighter.
  const bg0 = base.background;
  const panel0 = base.panel ?? (dark ? mix(bg0, fg, 0.06) : mix(bg0, "#ffffff", 0.65));
  const sidebar0 = base.sidebar ?? (dark ? mix(bg0, fg, 0.03) : mix(bg0, fg, 0.04));
  const border0 = base.border ?? mix(bg0, fg, dark ? 0.16 : 0.13);

  // Body text must reach 7:1 on every surface. With mid-tone backgrounds even pure
  // black/white can't, so the surfaces are pushed (as little as needed) away from the text.
  const extreme = dark ? "#000000" : "#ffffff";
  let bg = bg0, panel = panel0, sidebar = sidebar0, border = border0;
  let text = fg;
  for (let k = 0; k <= 1.0001; k += 0.05) {
    bg = mix(bg0, extreme, k);
    panel = mix(panel0, extreme, k);
    sidebar = mix(sidebar0, extreme, k);
    border = mix(border0, extreme, k);
    text = ensureContrast(fg, [bg, panel, sidebar], 7);
    if (worst(text, [bg, panel, sidebar]) >= 7) break;
  }
  const surfaces = [bg, panel, sidebar];
  const muted = ensureContrast(base.muted ?? mix(fg, bg, 0.35), surfaces, 4.5);
  const faint = ensureContrast(mix(fg, bg, 0.55), [panel], 3);

  // Accent: keep it as given when it reads well on panels and on its own tint.
  let accent = base.accent;
  let accentSoft = panel;
  let found = false;
  for (const k of [0.2, 0.14, 0.1]) {
    const soft = mix(panel, accent, k);
    if (contrastRatio(accent, soft) >= 4.5 && contrastRatio(accent, panel) >= 3) {
      accentSoft = soft;
      found = true;
      break;
    }
  }
  if (!found) {
    accent = ensureContrast(accent, [panel], 4.5);
    accentSoft = mix(panel, accent, 0.1);
    for (const k of [0.1, 0.06, 0.03, 0]) {
      accentSoft = mix(panel, accent, k);
      if (contrastRatio(accent, accentSoft) >= 4.5) break;
    }
  }
  const onAccent = [bg, "#ffffff", "#000000"].find((c) => contrastRatio(c, accent) >= 4.5) ?? "#000000";

  // Status colours -> readable text on a soft tint of the same hue.
  const tint = (color: string, k: number) => mix(panel, color, dark ? k * 1.2 : k);
  const chip = (color: string) => {
    const chipBg = tint(color, 0.18);
    return { bg: chipBg, fg: ensureContrast(color, [chipBg], 4.5) };
  };

  const dangerBase = base.danger ?? (dark ? "#f87171" : "#dc2626");
  const dangerBg = tint(dangerBase, 0.1);
  const danger = ensureContrast(dangerBase, [panel, dangerBg], 4.5);

  const warningBase = base.warning ?? (dark ? "#fcd34d" : "#d97706");
  const warnBg = tint(warningBase, 0.2);
  const warnSoft = tint(warningBase, 0.08);
  const warnFg = ensureContrast(warningBase, [warnBg, warnSoft], 4.5);
  const warnBorder = mix(panel, warningBase, 0.4);

  const ok = chip(base.success ?? (dark ? "#4ade80" : "#16a34a"));
  const del = chip(dangerBase);
  const char = base.character ?? accent;
  const charChip = chip(char);
  const placeBase = base.place ?? base.success ?? (dark ? "#4ade80" : "#16a34a");
  const placeChip = chip(placeBase);

  // Highlight: the text colour is black or white, and the highlight is moved until that is crisp.
  let markBg = base.highlight ?? warningBase;
  const markFg = contrastRatio("#000000", markBg) >= contrastRatio("#ffffff", markBg) ? "#000000" : "#ffffff";
  markBg = ensureContrast(markBg, [markFg], 7);
  const markRing = mix(markBg, markFg, 0.35);

  const backdrop = dark ? "rgba(0, 0, 0, 0.6)" : (() => {
    const [r, g, b] = hexToRgb(mix(fg, "#000000", 0.4));
    return `rgba(${r}, ${g}, ${b}, 0.35)`;
  })();

  const palette: Palette = {
    "bg": bg, "bg-panel": panel, "bg-sidebar": sidebar, "border": border,
    "text": text, "text-muted": muted, "text-faint": faint,
    "accent": accent, "accent-soft": accentSoft, "on-accent": onAccent,
    "danger": danger, "danger-bg": dangerBg,
    "warn-fg": warnFg, "warn-bg": warnBg, "warn-bg-soft": warnSoft, "warn-border": warnBorder,
    "ok-fg": ok.fg, "ok-bg": ok.bg, "del-fg": del.fg, "del-bg": del.bg,
    "char": char, "char-fg": charChip.fg, "char-bg": charChip.bg,
    "place": placeBase, "place-fg": placeChip.fg, "place-bg": placeChip.bg,
    "mark-bg": markBg, "mark-fg": markFg, "mark-ring": markRing,
    "backdrop": backdrop,
  };
  return { ...palette, ...overrides };
}
