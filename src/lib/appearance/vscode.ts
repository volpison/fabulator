/**
 * VS Code colour theme importer (the `.json` files under an extension's
 * `themes/` folder).
 *
 * A VS Code theme has ~600 optional `colors` keys plus TextMate `tokenColors`
 * for code. A story editor needs about ten colours, so we read a short list of
 * keys, each with a fallback chain, and let themegen derive the rest (it also
 * guarantees readable contrast). Not supported, reported clearly:
 * `include` (a theme that extends another file), `.vsix` packages, `.tmTheme`.
 */
import { luminance } from "./themes";
import { mix, normalizeHex } from "./themegen";
import type { ParseResult } from "./theme-file";

// ─── JSON with comments and trailing commas ────────────────

/** Remove // and /* *\/ comments and trailing commas, leaving strings alone. */
export function stripJsonc(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  // Trailing commas: a comma followed only by whitespace and a closing bracket.
  let res = "";
  i = 0;
  while (i < out.length) {
    const c = out[i];
    if (c === '"') {
      let j = i + 1;
      while (j < out.length && out[j] !== '"') j += out[j] === "\\" ? 2 : 1;
      res += out.slice(i, j + 1);
      i = j + 1;
    } else if (c === ",") {
      let j = i + 1;
      while (j < out.length && /\s/.test(out[j])) j++;
      if (out[j] === "}" || out[j] === "]") i++;
      else {
        res += c;
        i++;
      }
    } else {
      res += c;
      i++;
    }
  }
  return res;
}

export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(text.replace(/^﻿/, "")));
}

/** Does this parsed JSON look like a VS Code colour theme? */
export function looksLikeVscodeTheme(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const o = data as Record<string, unknown>;
  if (o.format === "fabulator-theme") return false;
  const colors = o.colors;
  const hasDotted =
    !!colors && typeof colors === "object" && Object.keys(colors as object).some((k) => k.includes("."));
  return hasDotted || Array.isArray(o.tokenColors) || typeof o.include === "string";
}

// ─── Colours ───────────────────────────────────────────────

/** "#rgb[a]" / "#rrggbb[aa]" -> opaque "#rrggbb" blended over `over` when it has alpha. */
export function resolveColor(value: unknown, over: string): string | null {
  if (typeof value !== "string") return null;
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = h.split("").map((c) => c + c).join("");
  const rgb = normalizeHex(h.slice(0, 6));
  if (!rgb) return null;
  if (h.length === 8) {
    const alpha = parseInt(h.slice(6), 16) / 255;
    if (alpha < 0.02) return null; // effectively transparent
    return mix(over, rgb, alpha);
  }
  return rgb;
}

type Rule = { scopes: string[]; color: string };

function tokenRules(tokenColors: unknown, over: string): Rule[] {
  if (!Array.isArray(tokenColors)) return [];
  const rules: Rule[] = [];
  for (const t of tokenColors) {
    if (!t || typeof t !== "object") continue;
    const { scope, settings } = t as { scope?: unknown; settings?: { foreground?: unknown } };
    const color = resolveColor(settings?.foreground, over);
    if (!color) continue;
    const scopes = (Array.isArray(scope) ? scope : typeof scope === "string" ? scope.split(",") : [])
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean);
    if (scopes.length) rules.push({ scopes, color });
  }
  return rules;
}

/** Colour for the first target scope that a rule defines (exact scope, else a parent scope). Later rules win. */
export function tokenColor(rules: Rule[], targets: string[]): string | null {
  for (const target of targets) {
    for (const exact of [true, false]) {
      for (let i = rules.length - 1; i >= 0; i--) {
        const hit = rules[i].scopes.some((s) => (exact ? s === target : target.startsWith(s + ".")));
        if (hit) return rules[i].color;
      }
    }
  }
  return null;
}

// ─── The importer ──────────────────────────────────────────

export function parseVscodeTheme(text: string): ParseResult {
  let data: unknown;
  try {
    data = parseJsonc(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON (${(e as Error).message}).` };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "The file is not a theme object." };
  }
  const o = data as Record<string, unknown>;

  if (o.contributes && typeof o.contributes === "object") {
    return {
      ok: false,
      error:
        "This is an extension manifest (package.json), not a theme. Import one of the theme .json files from the extension's themes/ folder.",
    };
  }
  if (!looksLikeVscodeTheme(o)) {
    return { ok: false, error: "This does not look like a VS Code colour theme (no \"colors\" or \"tokenColors\")." };
  }

  const warnings: string[] = [];
  const colorsRaw = o.colors && typeof o.colors === "object" && !Array.isArray(o.colors) ? (o.colors as Record<string, unknown>) : {};
  const include = typeof o.include === "string" ? o.include : null;

  const type = typeof o.type === "string" ? o.type.toLowerCase() : "";
  const declaredDark = type === "dark" || type === "hc" || type === "hc-dark" ? true : type === "light" || type === "hc-light" ? false : null;

  // Background first: everything with transparency is blended over it.
  const bg0 = resolveColor(colorsRaw["editor.background"], "#000000");
  if (!bg0 && include) {
    return {
      ok: false,
      error: `This theme extends another file ("${include}") and has no editor background of its own. Import the file it extends instead, or a complete theme.`,
    };
  }
  const dark = declaredDark ?? (bg0 ? luminance(bg0) < 0.4 : true);
  const background = bg0 ?? (dark ? "#1e1e1e" : "#ffffff");
  if (!bg0) warnings.push(`No editor background in the theme; using ${background}.`);
  if (include) warnings.push(`This theme extends "${include}", which is not loaded; missing colours were derived.`);

  const pick = (keys: string[], over = background): string | undefined => {
    for (const k of keys) {
      const c = resolveColor(colorsRaw[k], over);
      if (c) return c;
    }
    return undefined;
  };

  const foreground =
    pick(["editor.foreground", "foreground"]) ?? (dark ? "#d4d4d4" : "#333333");
  const rules = tokenRules(o.tokenColors, background);

  const accent =
    pick(["button.background", "textLink.foreground", "focusBorder", "progressBar.background", "activityBar.activeBorder", "activityBarBadge.background"]) ??
    tokenColor(rules, ["keyword", "entity.name.function"]) ??
    (dark ? "#569cd6" : "#0066b8");

  const warning = pick(["editorWarning.foreground", "list.warningForeground", "terminal.ansiYellow"]);
  const success = pick(["terminal.ansiGreen", "gitDecoration.addedResourceForeground", "editorGutter.addedBackground"]);

  const character =
    tokenColor(rules, ["entity.name.function", "entity.name.type", "entity.name.class", "support.function"]) ??
    pick(["terminal.ansiBlue", "terminal.ansiCyan"]);
  const place =
    tokenColor(rules, ["string", "string.quoted"]) ?? pick(["terminal.ansiGreen", "terminal.ansiMagenta"]);

  const highlight =
    pick(["editor.findMatchHighlightBackground", "editor.findMatchBackground", "editor.wordHighlightBackground"]) ?? warning;

  const nameRaw = typeof o.name === "string" ? o.name.trim() : "";
  const name = (nameRaw || "VS Code theme").slice(0, 60);

  const colors: Record<string, string | undefined> = {
    background,
    foreground,
    accent,
    panel: pick(["editorWidget.background", "panel.background", "tab.activeBackground"]),
    sidebar: pick(["sideBar.background", "activityBar.background"]),
    border: pick(["panel.border", "sideBar.border", "editorGroup.border", "widget.border", "contrastBorder"]),
    muted: pick(["descriptionForeground", "editorLineNumber.foreground", "sideBar.foreground"]),
    danger: pick(["editorError.foreground", "errorForeground", "terminal.ansiRed"]),
    success,
    warning,
    character,
    place,
    highlight,
  };
  for (const k of Object.keys(colors)) if (!colors[k]) delete colors[k];

  return {
    ok: true,
    source: "vscode",
    warnings,
    spec: { name, dark, colors: colors as { background: string; foreground: string; accent: string } },
  };
}
