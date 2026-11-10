/**
 * Appearance & reading settings. Pure (no Svelte/Tauri): validation, theme
 * resolution and the CSS variables to apply. Persistence/DOM lives in
 * appearance.ts.
 */
import { THEMES, themeById, type ThemeId, type ThemeInfo } from "./themes";

/** "system", a built-in id, or an imported theme ("user:<slug>"). */
export type ThemeChoice = string;
export type EditorFont = "serif" | "sans" | "mono";
export type EditorWidth = "narrow" | "medium" | "wide" | "full";
export type LineSpacing = "compact" | "normal" | "relaxed";

export type Settings = {
  theme: ThemeChoice;
  /** Whole-interface zoom in percent. */
  uiScale: number;
  editorFont: EditorFont;
  /** Manuscript text size in px. */
  editorSize: number;
  editorWidth: EditorWidth;
  lineSpacing: LineSpacing;
};

export const UI_SCALES = [90, 100, 110, 125, 150] as const;
export const EDITOR_SIZE_MIN = 13;
export const EDITOR_SIZE_MAX = 26;

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  uiScale: 100,
  editorFont: "serif",
  editorSize: 17,
  editorWidth: "medium",
  lineSpacing: "normal",
};

export const EDITOR_FONTS: Record<EditorFont, { label: string; css: string }> = {
  serif: { label: "Serif", css: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif' },
  sans: { label: "Sans", css: '"Segoe UI", system-ui, -apple-system, sans-serif' },
  mono: { label: "Mono", css: 'Consolas, "SF Mono", "Cascadia Mono", Menlo, monospace' },
};

export const EDITOR_WIDTHS: Record<EditorWidth, { label: string; css: string }> = {
  narrow: { label: "Narrow", css: "34rem" },
  medium: { label: "Medium", css: "42rem" },
  wide: { label: "Wide", css: "54rem" },
  full: { label: "Full", css: "none" },
};

export const LINE_SPACINGS: Record<LineSpacing, { label: string; value: string }> = {
  compact: { label: "Compact", value: "1.45" },
  normal: { label: "Normal", value: "1.7" },
  relaxed: { label: "Relaxed", value: "2" },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const USER_THEME_ID = /^user:[a-z0-9][a-z0-9-]{0,47}$/;

function isThemeChoice(v: unknown): v is ThemeChoice {
  return (
    typeof v === "string" &&
    (v === "system" || THEMES.some((t) => t.id === v) || USER_THEME_ID.test(v))
  );
}

/** Anything (e.g. parsed localStorage) -> valid settings; unknown values fall back to the defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  return {
    theme: isThemeChoice(r.theme) ? r.theme : d.theme,
    uiScale: clamp(Math.round(num(r.uiScale, d.uiScale)), UI_SCALES[0], UI_SCALES[UI_SCALES.length - 1]),
    editorFont: pick(r.editorFont, Object.keys(EDITOR_FONTS) as EditorFont[], d.editorFont),
    editorSize: clamp(Math.round(num(r.editorSize, d.editorSize)), EDITOR_SIZE_MIN, EDITOR_SIZE_MAX),
    editorWidth: pick(r.editorWidth, Object.keys(EDITOR_WIDTHS) as EditorWidth[], d.editorWidth),
    lineSpacing: pick(r.lineSpacing, Object.keys(LINE_SPACINGS) as LineSpacing[], d.lineSpacing),
  };
}

/**
 * The theme to show. "system" follows the operating system's light/dark
 * setting; an imported theme that is not (or no longer) available falls back
 * to the system choice instead of breaking the app.
 */
export function resolveThemeInfo(choice: ThemeChoice, systemDark: boolean, custom: ThemeInfo[] = []): ThemeInfo {
  const found = [...THEMES, ...custom].find((t) => t.id === choice);
  if (found) return found;
  return themeById(systemDark ? "dark" : "light");
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean, custom: ThemeInfo[] = []): ThemeId {
  return resolveThemeInfo(choice, systemDark, custom).id as ThemeId;
}

/** Every CSS custom property the settings control, ready for `style.setProperty`. */
export function cssVarsFor(
  settings: Settings,
  systemDark: boolean,
  custom: ThemeInfo[] = []
): Record<string, string> {
  const theme = resolveThemeInfo(settings.theme, systemDark, custom);
  const vars: Record<string, string> = {};
  for (const [token, value] of Object.entries(theme.palette)) vars[`--${token}`] = value;
  vars["--editor-font"] = EDITOR_FONTS[settings.editorFont].css;
  vars["--editor-size"] = `${settings.editorSize}px`;
  vars["--editor-width"] = EDITOR_WIDTHS[settings.editorWidth].css;
  vars["--editor-leading"] = LINE_SPACINGS[settings.lineSpacing].value;
  vars["--ui-scale"] = String(settings.uiScale / 100);
  return vars;
}
