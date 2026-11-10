/**
 * Runtime side of the appearance settings: load/save (localStorage, always
 * in try/catch), apply the CSS variables to <html>, follow the OS theme.
 * The pure rules live in settings.ts / themes.ts.
 */
import { writable, get } from "svelte/store";
import { cssVarsFor, DEFAULT_SETTINGS, sanitizeSettings, resolveThemeInfo, type Settings } from "./settings";
import { isPalette, type ThemeInfo } from "./themes";

const STORE_KEY = "fabulator.settings";
const CACHE_KEY = "fabulator.themeCache";

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const settings = writable<Settings>(load());

/** Imported themes (files in the app's themes folder). */
export const customThemes = writable<ThemeInfo[]>([]);

const media =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

/** The theme that is showing, for the View menu and for exporting it. */
export function currentTheme(): ThemeInfo {
  return resolveThemeInfo(get(settings).theme, media?.matches ?? false, get(customThemes));
}

export function apply(s: Settings, custom: ThemeInfo[]): void {
  const root = document.documentElement;
  const dark = media?.matches ?? false;
  for (const [name, value] of Object.entries(cssVarsFor(s, dark, custom))) {
    root.style.setProperty(name, value);
  }
  const info = resolveThemeInfo(s.theme, dark, custom);
  root.dataset.theme = info.id;
  // Native scrollbars and form controls follow the theme.
  root.style.colorScheme = info.dark ? "dark" : "light";

  // An imported theme is loaded from files a moment after start-up; remembering the
  // one in use lets the very first paint already be right (no flash of another theme).
  try {
    if (info.id.startsWith("user:")) localStorage.setItem(CACHE_KEY, JSON.stringify(info));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* optional */
  }
}

function cachedTheme(wanted: string): ThemeInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ThemeInfo>;
    if (v && v.id === wanted && typeof v.label === "string" && typeof v.dark === "boolean" && isPalette(v.palette)) {
      return v as ThemeInfo;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Call once before the app mounts (no flash of the wrong theme). Returns a cleanup function. */
export function initAppearance(): () => void {
  const wanted = get(settings).theme;
  if (wanted.startsWith("user:")) {
    const cached = cachedTheme(wanted);
    if (cached) customThemes.set([cached]);
  }
  apply(get(settings), get(customThemes));

  const unsubscribeSettings = settings.subscribe((s) => {
    apply(s, get(customThemes));
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch {
      /* remembering is optional */
    }
  });
  const unsubscribeThemes = customThemes.subscribe((list) => apply(get(settings), list));
  const onSystem = () => apply(get(settings), get(customThemes));
  media?.addEventListener("change", onSystem);
  return () => {
    unsubscribeSettings();
    unsubscribeThemes();
    media?.removeEventListener("change", onSystem);
  };
}

export function updateSettings(patch: Partial<Settings>): void {
  settings.update((s) => sanitizeSettings({ ...s, ...patch }));
}

export function resetSettings(): void {
  settings.set({ ...DEFAULT_SETTINGS });
}
