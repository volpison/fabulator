import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseThemeFile, importThemeText, specToTheme, themeToSpec, serializeSpec, slugify, themeIdFor,
  THEME_FORMAT, MAX_THEME_FILE_BYTES,
} from "../src/lib/theme-file.ts";
import { parseBase16 } from "../src/lib/base16.ts";
import { THEMES, contrastReport, isPalette } from "../src/lib/themes.ts";

const ok = (r: ReturnType<typeof parseThemeFile>) => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r as Extract<typeof r, { ok: true }>;
};
const err = (r: ReturnType<typeof parseThemeFile>) => {
  assert.equal(r.ok, false);
  return (r as Extract<typeof r, { ok: false }>).error;
};

const minimal = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ format: THEME_FORMAT, version: 1, name: "Mine", colors: { background: "#101010", foreground: "#eeeeee", accent: "#ff8800" }, ...over });

// ── Fabulator JSON ────────────────────────────────────────────

test("minimal theme: three colours is enough; dark is inferred", () => {
  const r = ok(parseThemeFile(minimal()));
  assert.equal(r.spec.name, "Mine");
  assert.equal(r.spec.dark, true);
  assert.deepEqual(r.warnings, []);
  const info = specToTheme(r.spec);
  assert.equal(info.id, "user:mine");
  assert.ok(isPalette(info.palette));
  assert.deepEqual(contrastReport(info.palette), []);
  assert.equal(ok(parseThemeFile(minimal({ colors: { background: "#fff", foreground: "#111", accent: "#06f" } }))).spec.dark, false);
  assert.equal(ok(parseThemeFile(minimal({ dark: false }))).spec.dark, false); // explicit wins
});

test("validation errors are specific", () => {
  assert.match(err(parseThemeFile("{nope")), /Not valid JSON/);
  assert.match(err(parseThemeFile("[]")), /not a theme object/);
  assert.match(err(parseThemeFile(JSON.stringify({ name: "x" }))), /missing "format"/);
  assert.match(err(parseThemeFile(minimal({ version: 2 }))), /version 2.*up to 1/);
  assert.match(err(parseThemeFile(minimal({ version: "1" }))), /version/);
  assert.match(err(parseThemeFile(minimal({ name: "  " }))), /"name"/);
  assert.match(err(parseThemeFile(minimal({ name: "x".repeat(61) }))), /60/);
  assert.match(err(parseThemeFile(minimal({ colors: { foreground: "#fff", accent: "#fff" } }))), /colors\.background is required/);
  assert.match(err(parseThemeFile(minimal({ colors: { background: "red", foreground: "#fff", accent: "#fff" } }))), /colors\.background.*hex/);
  assert.match(err(parseThemeFile(minimal({ colors: { background: "#000", foreground: "#fff", accent: "#fff", danger: 5 } }))), /colors\.danger/);
});


test("unknown colours / bad tokens become warnings, valid tokens override", () => {
  const r = ok(parseThemeFile(minimal({
    colors: { background: "#101010", foreground: "#eeeeee", accent: "#ff8800", sparkle: "#fff" },
    tokens: { "bg-panel": "#202020", bogus: "#fff", text: 5, "text-muted": "nope", backdrop: "rgba(0, 0, 0, 0.5)" },
  })));
  assert.equal(r.warnings.length, 4);
  assert.match(r.warnings.join("\n"), /sparkle/);
  assert.match(r.warnings.join("\n"), /bogus/);
  const p = specToTheme(r.spec).palette;
  assert.equal(p["bg-panel"], "#202020");
  assert.equal(p["backdrop"], "rgba(0, 0, 0, 0.5)");
});

test("export -> import round-trips every built-in theme exactly", () => {
  for (const t of THEMES) {
    const text = serializeSpec(themeToSpec(t, "Fabulator"));
    const back = specToTheme(ok(parseThemeFile(text)).spec);
    assert.deepEqual(back.palette, t.palette, t.id);
    assert.equal(back.dark, t.dark);
    assert.equal(back.label, t.label);
  }
  assert.ok(serializeSpec(themeToSpec(THEMES[0])).endsWith("}\n"));
  assert.equal(JSON.parse(serializeSpec(themeToSpec(THEMES[0]))).format, THEME_FORMAT);
});

test("slugify / ids", () => {
  assert.equal(slugify("Tokyo Night — Storm!"), "tokyo-night-storm");
  assert.equal(slugify("Crème Brûlée"), "creme-brulee");
  assert.equal(slugify("日本語"), "theme");
  assert.equal(slugify("   "), "theme");
  assert.equal(slugify("a".repeat(100)).length, 48);
  assert.equal(themeIdFor("Dracula"), "user:dracula");
});

// ── Base16 ────────────────────────────────────────────────────

const SOLARIZED_DARK_LEGACY = `# Solarized Dark by Ethan Schoonover
scheme: "Solarized Dark"
author: "Ethan Schoonover (modified by aramisgithub)"
base00: "002b36"
base01: "073642"
base02: "586e75"
base03: "657b83"
base04: "839496"
base05: "93a1a1"
base06: "eee8d5"
base07: "fdf6e3"
base08: "dc322f"
base09: "cb4b16"
base0A: "b58900"
base0B: "859900"
base0C: "2aa198"
base0D: "268bd2"
base0E: "6c71c4"
base0F: "d33682"
`;

const NEW_FORMAT_LIGHT = `system: "base16"
name: "Solarized Light"   # inline comment
author: "Ethan Schoonover"
variant: "light"
palette:
  base00: "#fdf6e3"
  base01: "#eee8d5"
  base02: "#93a1a1"
  base03: "#839496"
  base04: "#657b83"
  base05: "#586e75"
  base06: "#073642"
  base07: "#002b36"
  base08: "#dc322f"
  base09: "#cb4b16"
  base0A: "#b58900"
  base0B: "#859900"
  base0C: "#2aa198"
  base0D: "#268bd2"
  base0E: "#6c71c4"
  base0F: "#d33682"
`;

test("Base16 legacy flat format", () => {
  const r = ok(importThemeText(SOLARIZED_DARK_LEGACY));
  assert.equal(r.source, "base16");
  assert.equal(r.spec.name, "Solarized Dark");
  assert.equal(r.spec.author, "Ethan Schoonover (modified by aramisgithub)");
  assert.equal(r.spec.dark, true);
  assert.equal(r.spec.colors.background, "#002b36");
  assert.equal(r.spec.colors.panel, "#073642");
  assert.equal(r.spec.colors.foreground, "#93a1a1");
  assert.equal(r.spec.colors.accent, "#268bd2");
  assert.equal(r.spec.colors.danger, "#dc322f");
  assert.equal(r.spec.colors.success, "#859900");
  const info = specToTheme(r.spec);
  assert.deepEqual(contrastReport(info.palette), []);
  assert.equal(info.id, "user:solarized-dark");
});

test("Base16 new format: palette block, '#' colours, comments, light variant", () => {
  const r = ok(importThemeText(NEW_FORMAT_LIGHT));
  assert.equal(r.spec.name, "Solarized Light");
  assert.equal(r.spec.dark, false);
  assert.equal(r.spec.colors.panel, "#fdf6e3"); // brightest is the panel on light themes
  assert.equal(r.spec.colors.sidebar, "#eee8d5");
  assert.equal(r.spec.colors.foreground, "#586e75");
  assert.deepEqual(contrastReport(specToTheme(r.spec).palette), []);
});

test("Base16: dark inferred without variant; CRLF, BOM and unquoted values are fine", () => {
  const text = "﻿" + SOLARIZED_DARK_LEGACY.replace(/"/g, "").replace(/\n/g, "\r\n");
  const r = ok(importThemeText(text));
  assert.equal(r.spec.dark, true);
  assert.equal(r.spec.colors.background, "#002b36");
  const lightNoVariant = ok(importThemeText(NEW_FORMAT_LIGHT.replace('variant: "light"\n', "")));
  assert.equal(lightNoVariant.spec.dark, false);
});

test("Base16 errors: missing slot, bad colour", () => {
  assert.match(err(importThemeText(SOLARIZED_DARK_LEGACY.replace(/base0F.*\n/, ""))), /missing base0F/);
  assert.match(err(importThemeText(SOLARIZED_DARK_LEGACY.replace('"002b36"', '"zzz"'))), /base00 is not a hex colour/);
  assert.match(err(parseBase16("name: x\nbase00: 000000")), /missing base01/);
});

test("importThemeText: detection and limits", () => {
  assert.match(err(importThemeText("")), /empty/);
  assert.match(err(importThemeText("hello world")), /Unknown theme format/);
  assert.match(err(importThemeText("x".repeat(MAX_THEME_FILE_BYTES + 1))), /too big/);
  assert.equal(ok(importThemeText(minimal())).source, "fabulator");
});

test("the bundled example themes all import and are readable", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../themes/examples/", import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.(json|ya?ml)$/.test(f));
  assert.ok(files.length >= 6);
  for (const f of files) {
    const r = ok(importThemeText(readFileSync(new URL(f, dir), "utf8")));
    assert.deepEqual(r.warnings, [], f);
    assert.deepEqual(contrastReport(specToTheme(r.spec).palette), [], f);
  }
});
