import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEMES, THEME_TOKENS, contrastReport } from "../src/lib/themes.ts";
import {
  DEFAULT_SETTINGS, sanitizeSettings, resolveTheme, resolveThemeInfo, cssVarsFor, EDITOR_SIZE_MAX, EDITOR_SIZE_MIN,
} from "../src/lib/settings.ts";

test("every theme defines exactly the same tokens", () => {
  for (const t of THEMES) {
    assert.deepEqual(Object.keys(t.palette).sort(), [...THEME_TOKENS].sort(), t.id);
  }
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
});

test("every theme is readable (WCAG contrast)", () => {
  const failures: string[] = [];
  for (const { id, palette } of THEMES) for (const f of contrastReport(palette)) failures.push(`${id}: ${f}`);
  assert.deepEqual(failures, []);
});

test("app.css :root holds the light theme (fallback before settings apply)", () => {
  const css = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
  const root = /:root\s*\{([^}]*)\}/.exec(css)![1];
  const light = THEMES.find((t) => t.id === "light")!.palette;
  for (const [token, value] of Object.entries(light)) {
    const m = new RegExp(`--${token}:\\s*([^;]+);`).exec(root);
    assert.ok(m, `--${token} missing in app.css :root`);
    assert.equal(m![1].trim().toLowerCase(), value.toLowerCase(), `--${token}`);
  }
});

test("sanitizeSettings: defaults, bad values, clamping", () => {
  assert.deepEqual(sanitizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings("nope"), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings({ theme: "neon", editorFont: 3, editorWidth: null, uiScale: "big" }), DEFAULT_SETTINGS);
  const s = sanitizeSettings({ theme: "sepia", editorSize: 999, uiScale: 10, lineSpacing: "relaxed", editorFont: "mono", editorWidth: "full" });
  assert.deepEqual([s.theme, s.editorSize, s.uiScale, s.lineSpacing, s.editorFont, s.editorWidth], ["sepia", EDITOR_SIZE_MAX, 90, "relaxed", "mono", "full"]);
  assert.equal(sanitizeSettings({ editorSize: 1 }).editorSize, EDITOR_SIZE_MIN);
  assert.equal(sanitizeSettings({ editorSize: 17.6 }).editorSize, 18);
  assert.equal(sanitizeSettings({ editorSize: NaN }).editorSize, DEFAULT_SETTINGS.editorSize);
});

test("resolveTheme follows the system only for 'system'", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("sepia", true), "sepia");
  assert.equal(resolveTheme("midnight", false), "midnight");
});

test("cssVarsFor gives every token plus the reading variables", () => {
  const v = cssVarsFor({ ...DEFAULT_SETTINGS, theme: "dark", uiScale: 110, editorSize: 20, editorWidth: "wide" }, false);
  for (const t of THEME_TOKENS) assert.ok(v[`--${t}`], t);
  assert.equal(v["--bg"], "#0b1220");
  assert.equal(v["--editor-size"], "20px");
  assert.equal(v["--editor-width"], "54rem");
  assert.equal(v["--ui-scale"], "1.1");
  assert.equal(cssVarsFor(DEFAULT_SETTINGS, true)["--bg"], "#0b1220"); // system dark
});

test("settings accept imported theme ids and fall back safely when they are missing", () => {
  assert.equal(sanitizeSettings({ theme: "user:dracula" }).theme, "user:dracula");
  assert.equal(sanitizeSettings({ theme: "user:../evil" }).theme, "system");
  assert.equal(sanitizeSettings({ theme: "user:" }).theme, "system");
  const custom = [{ id: "user:dracula", label: "Dracula", dark: true, palette: THEMES[1].palette }];
  assert.equal(resolveThemeInfo("user:dracula", false, custom).label, "Dracula");
  assert.equal(resolveThemeInfo("user:gone", true, custom).id, "dark"); // missing -> system choice
  assert.equal(resolveThemeInfo("user:gone", false, []).id, "light");
  const v = cssVarsFor({ ...DEFAULT_SETTINGS, theme: "user:dracula" }, false, custom);
  assert.equal(v["--bg"], THEMES[1].palette["bg"]);
});
