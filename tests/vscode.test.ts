import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripJsonc, parseJsonc, resolveColor, tokenColor, parseVscodeTheme, looksLikeVscodeTheme } from "../src/lib/vscode.ts";
import { importThemeText, specToTheme } from "../src/lib/theme-file.ts";
import { contrastReport, isPalette } from "../src/lib/themes.ts";

const ok = (r: ReturnType<typeof parseVscodeTheme>) => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r as Extract<typeof r, { ok: true }>;
};
const err = (r: ReturnType<typeof parseVscodeTheme>) => {
  assert.equal(r.ok, false);
  return (r as Extract<typeof r, { ok: false }>).error;
};

test("JSONC: comments and trailing commas go; strings are untouched", () => {
  const text = `{
    // line comment
    "a": "http://x.test/*not a comment*/", /* block */
    "b": [1, 2, ], "c": "trailing,}", 
  }`;
  assert.deepEqual(parseJsonc(text), { a: "http://x.test/*not a comment*/", b: [1, 2], c: "trailing,}" });
  assert.equal(stripJsonc('"a\\"//b"'), '"a\\"//b"');
  assert.deepEqual(parseJsonc("﻿{}"), {});
});

test("colours: short forms, alpha blending, junk", () => {
  assert.equal(resolveColor("#fff", "#000000"), "#ffffff");
  assert.equal(resolveColor("#ff0000", "#000000"), "#ff0000");
  assert.equal(resolveColor("#ffffff80", "#000000"), "#808080");
  assert.equal(resolveColor("#fff8", "#000000"), "#888888");
  assert.equal(resolveColor("#ffffff00", "#000000"), null);
  assert.equal(resolveColor("red", "#000000"), null);
  assert.equal(resolveColor(5, "#000000"), null);
});

test("token colours: exact scope, parent scope, later rules win", () => {
  const rules = [
    { scopes: ["string"], color: "#111111" },
    { scopes: ["string.quoted"], color: "#222222" },
    { scopes: ["entity.name"], color: "#333333" },
  ];
  assert.equal(tokenColor(rules, ["string"]), "#111111");
  assert.equal(tokenColor(rules, ["string.quoted"]), "#222222");
  assert.equal(tokenColor(rules, ["entity.name.function"]), "#333333"); // parent scope
  assert.equal(tokenColor(rules, ["nothing", "string"]), "#111111");
  assert.equal(tokenColor(rules, ["nothing"]), null);
});

test("example theme imports and maps the expected colours", () => {
  const r = ok(parseVscodeTheme(readFileSync("themes/examples/midnight-orchard.vscode.json", "utf8")));
  assert.equal(r.source, "vscode");
  assert.equal(r.spec.name, "Midnight Orchard");
  assert.equal(r.spec.dark, true);
  const c = r.spec.colors;
  assert.equal(c.background, "#1b1f2a");
  assert.equal(c.accent, "#e0884a");
  assert.equal(c.sidebar, "#161a23");
  assert.equal(c.panel, "#232938");
  assert.equal(c.character, "#8cb8f0");
  assert.equal(c.place, "#a6d08a");
  assert.equal(c.success, "#7fc98a");
  assert.notEqual(c.highlight, "#e6c15a"); // alpha was blended
  assert.deepEqual(r.warnings, []);
});

test("imported theme is a complete palette that passes the contrast rules", () => {
  const r = ok(parseVscodeTheme(readFileSync("themes/examples/midnight-orchard.vscode.json", "utf8")));
  const info = specToTheme(r.spec);
  assert.ok(isPalette(info.palette));
  assert.deepEqual(contrastReport(info.palette), []);
});

test("minimal and odd themes still yield readable palettes", () => {
  for (const bg of ["#808080", "#ffffff", "#000000", "#7f7f80"]) {
    const r = ok(parseVscodeTheme(JSON.stringify({ colors: { "editor.background": bg, "editor.foreground": "#888888" } })));
    assert.deepEqual(contrastReport(specToTheme(r.spec).palette), [], bg);
  }
});

test("no background: sensible default by type, with a warning", () => {
  const dark = ok(parseVscodeTheme(JSON.stringify({ type: "dark", tokenColors: [] })));
  assert.equal(dark.spec.dark, true);
  assert.match(dark.warnings[0], /No editor background/);
  const light = ok(parseVscodeTheme(JSON.stringify({ type: "light", colors: { "x.y": "#fff" } })));
  assert.equal(light.spec.dark, false);
  assert.equal(light.spec.colors.background, "#ffffff");
});

test("dark/light is inferred from the background when 'type' is missing", () => {
  assert.equal(ok(parseVscodeTheme(JSON.stringify({ colors: { "editor.background": "#fafafa" } }))).spec.dark, false);
  assert.equal(ok(parseVscodeTheme(JSON.stringify({ colors: { "editor.background": "#101010" } }))).spec.dark, true);
});

test("include: complete themes warn, empty ones are refused with a clear message", () => {
  const withBg = ok(parseVscodeTheme(JSON.stringify({ include: "./base.json", colors: { "editor.background": "#202020" } })));
  assert.match(withBg.warnings.join(" "), /extends "\.\/base\.json"/);
  assert.match(err(parseVscodeTheme(JSON.stringify({ include: "./base.json", tokenColors: [] }))), /extends another file/);
});

test("extension manifests, non-themes and broken JSON get specific errors", () => {
  assert.match(err(parseVscodeTheme(JSON.stringify({ name: "x", contributes: { themes: [] } }))), /extension manifest/);
  assert.match(err(parseVscodeTheme(JSON.stringify({ hello: 1 }))), /does not look like a VS Code/);
  assert.match(err(parseVscodeTheme("{ nope")), /Not valid JSON/);
  assert.match(err(parseVscodeTheme("[1]")), /not a theme object/);
});

test("importThemeText routes by content", () => {
  const vs = readFileSync("themes/examples/midnight-orchard.vscode.json", "utf8");
  assert.equal(ok(importThemeText(vs) as never).source, "vscode");
  const fab = readFileSync("themes/examples/dracula.json", "utf8");
  assert.equal((importThemeText(fab) as { source: string }).source, "fabulator");
  assert.match(err(importThemeText('{ "colors": { "editor.background": "#000", ') as never), /Not valid JSON/);
  assert.equal(looksLikeVscodeTheme({ format: "fabulator-theme", colors: { "a.b": "#fff" } }), false);
});
