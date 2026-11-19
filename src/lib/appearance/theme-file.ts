/**
 * The Fabulator theme file (JSON) and the importers that produce it.
 *
 *   {
 *     "format": "fabulator-theme", "version": 1,
 *     "name": "Dracula", "author": "…", "dark": true,
 *     "colors":  { "background": "#282a36", "foreground": "#f8f8f2", "accent": "#bd93f9", …optional… },
 *     "tokens":  { "bg-panel": "#343746", … }        // optional exact overrides
 *   }
 *
 * Only background, foreground and accent are required; everything else is
 * derived (themegen.ts) and kept readable. `tokens` can pin any individual
 * token exactly (exports use it so a theme round-trips perfectly).
 *
 * Pure (no Svelte/Tauri), unit-tested.
 */
import { THEME_TOKENS, luminance, type Palette, type ThemeInfo, type ThemeToken } from "./themes";
import { buildPalette, normalizeHex, type BaseColors } from "./themegen";
import { parseBase16 } from "./base16";
import { parseJsonc, looksLikeVscodeTheme, parseVscodeTheme } from "./vscode";

export const THEME_FORMAT = "fabulator-theme";
export const THEME_VERSION = 1;
export const MAX_THEME_FILE_BYTES = 256 * 1024;

export type ThemeSpec = {
  name: string;
  author?: string;
  /** Optional group name shown in the theme browser. */
  collection?: string;
  dark: boolean;
  colors: BaseColors;
  tokens?: Partial<Palette>;
};

export type ParseResult =
  | { ok: true; spec: ThemeSpec; warnings: string[]; source: "fabulator" | "base16" | "base24" | "vscode" }
  | { ok: false; error: string };

const REQUIRED = ["background", "foreground", "accent"] as const;
const OPTIONAL = [
  "panel", "sidebar", "border", "muted", "danger", "success", "warning",
  "character", "place", "highlight",
] as const;

const fail = (error: string): ParseResult => ({ ok: false, error });

/** A group name: one trimmed line, at most 60 characters; anything else is ignored. */
export function cleanCollection(x: unknown): string | undefined {
  if (typeof x !== "string") return undefined;
  const v = x.replace(/\s+/g, " ").trim().slice(0, 60);
  return v || undefined;
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "theme";
}

export const themeIdFor = (name: string) => `user:${slugify(name)}`;

/** Parse and validate a Fabulator theme file. */
export function parseThemeFile(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return fail(`Not valid JSON (${(e as Error).message}).`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("The file is not a theme object.");
  const o = data as Record<string, unknown>;

  if (o.format !== THEME_FORMAT) {
    if (o.colors && typeof o.colors === "object" && Object.keys(o.colors as object).some((k) => k.includes("."))) {
      return parseVscodeTheme(text);
    }
    return fail(`Not a Fabulator theme (missing "format": "${THEME_FORMAT}").`);
  }
  if (typeof o.version !== "number" || !Number.isInteger(o.version) || o.version < 1) return fail('Missing or invalid "version".');
  if (o.version > THEME_VERSION) return fail(`This theme uses format version ${o.version}; this Fabulator understands up to ${THEME_VERSION}. Update Fabulator.`);

  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return fail('The theme needs a "name".');
  if (name.length > 60) return fail("The theme name is longer than 60 characters.");

  if (!o.colors || typeof o.colors !== "object" || Array.isArray(o.colors)) return fail('Missing "colors".');
  const rawColors = o.colors as Record<string, unknown>;
  const warnings: string[] = [];
  const colors: Record<string, string> = {};

  for (const key of REQUIRED) {
    const v = rawColors[key];
    if (typeof v !== "string") return fail(`colors.${key} is required.`);
    const hex = normalizeHex(v);
    if (!hex) return fail(`colors.${key} is not a hex colour (use #rrggbb): ${JSON.stringify(v)}`);
    colors[key] = hex;
  }
  for (const key of OPTIONAL) {
    const v = rawColors[key];
    if (v === undefined) continue;
    const hex = typeof v === "string" ? normalizeHex(v) : null;
    if (!hex) return fail(`colors.${key} is not a hex colour (use #rrggbb): ${JSON.stringify(v)}`);
    colors[key] = hex;
  }
  for (const key of Object.keys(rawColors)) {
    if (!(REQUIRED as readonly string[]).includes(key) && !(OPTIONAL as readonly string[]).includes(key)) {
      warnings.push(`Ignored unknown colour "${key}".`);
    }
  }

  let tokens: Partial<Palette> | undefined;
  if (o.tokens !== undefined) {
    if (!o.tokens || typeof o.tokens !== "object" || Array.isArray(o.tokens)) return fail('"tokens" must be an object.');
    tokens = {};
    for (const [key, v] of Object.entries(o.tokens as Record<string, unknown>)) {
      if (!(THEME_TOKENS as readonly string[]).includes(key)) { warnings.push(`Ignored unknown token "${key}".`); continue; }
      if (typeof v !== "string") { warnings.push(`Ignored token "${key}": not a string.`); continue; }
      if (key === "backdrop") {
        if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(v)) tokens[key] = v;
        else warnings.push('Ignored token "backdrop": use rgba(r, g, b, a).');
        continue;
      }
      const hex = normalizeHex(v);
      if (hex) tokens[key as ThemeToken] = hex;
      else warnings.push(`Ignored token "${key}": not a hex colour.`);
    }
  }

  const dark =
    typeof o.dark === "boolean" ? o.dark : luminance(colors.background) < 0.4;
  const author = typeof o.author === "string" && o.author.trim() ? o.author.trim().slice(0, 100) : undefined;

  const collection = cleanCollection(o.collection);

  return {
    ok: true,
    source: "fabulator",
    warnings,
    spec: { name, author, collection, dark, colors: colors as BaseColors, tokens },
  };
}

/** Detect the format and parse. Supports Fabulator JSON, VS Code JSON and Base16 YAML. */
export function importThemeText(text: string): ParseResult {
  const t = text.replace(/^﻿/, "");
  if (t.length > MAX_THEME_FILE_BYTES) return fail("The file is too big to be a theme.");
  const trimmed = t.trim();
  if (!trimmed) return fail("The file is empty.");
  if (trimmed.startsWith("{")) {
    // Fabulator files are plain JSON with a "format" key; VS Code files may contain comments.
    if (/"format"\s*:\s*"fabulator-theme"/.test(trimmed)) return parseThemeFile(trimmed);
    try {
      if (looksLikeVscodeTheme(parseJsonc(trimmed)) || /"contributes"\s*:/.test(trimmed)) return parseVscodeTheme(trimmed);
    } catch {
      return parseVscodeTheme(trimmed); // reports the JSON error
    }
    return parseThemeFile(trimmed);
  }
  if (/^\s*(?:["']?)base0[0-9a-f](?:["']?)\s*:/im.test(trimmed)) return parseBase16(trimmed);
  return fail("Unknown theme format. Supported: a Fabulator theme (.json), a VS Code theme (.json) or a Base16 scheme (.yaml / .yml).");
}

export function specToTheme(spec: ThemeSpec): ThemeInfo {
  return {
    id: themeIdFor(spec.name),
    label: spec.name,
    dark: spec.dark,
    palette: buildPalette(spec.colors, spec.dark, spec.tokens ?? {}),
    collection: spec.collection,
  };
}

/** A theme (built-in or imported) as a spec, with every token pinned so it reproduces exactly. */
export function themeToSpec(info: ThemeInfo, author?: string): ThemeSpec {
  const p = info.palette;
  return {
    name: info.label,
    author,
    dark: info.dark,
    colors: {
      background: p["bg"], foreground: p["text"], accent: p["accent"],
      panel: p["bg-panel"], sidebar: p["bg-sidebar"], border: p["border"],
      muted: p["text-muted"], danger: p["danger"], success: p["ok-fg"], warning: p["warn-fg"],
      character: p["char"], place: p["place"], highlight: p["mark-bg"],
    },
    tokens: { ...p },
  };
}

export function serializeSpec(spec: ThemeSpec): string {
  const out: Record<string, unknown> = {
    format: THEME_FORMAT,
    version: THEME_VERSION,
    name: spec.name,
  };
  if (spec.author) out.author = spec.author;
  if (spec.collection) out.collection = spec.collection;
  out.dark = spec.dark;
  out.colors = spec.colors;
  if (spec.tokens && Object.keys(spec.tokens).length) out.tokens = spec.tokens;
  return JSON.stringify(out, null, 2) + "\n";
}
