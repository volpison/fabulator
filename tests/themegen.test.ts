import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHex, mix, ensureContrast, buildPalette, rgbToHex, hexToRgb, type BaseColors } from "../src/lib/themegen.ts";
import { contrastRatio, contrastReport, isPalette, THEME_TOKENS, THEMES } from "../src/lib/themes.ts";

test("normalizeHex accepts #rgb / #rrggbb with or without #, rejects the rest", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("282a36"), "#282a36");
  assert.equal(normalizeHex(" #FFFFFF "), "#ffffff");
  for (const bad of ["", "#12", "#12345", "red", "rgb(1,2,3)", "#gggggg", "#1234567"]) assert.equal(normalizeHex(bad), null, bad);
});

test("mix and rgb round trip", () => {
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mix("#102030", "#ffffff", 0), "#102030");
  assert.equal(mix("#102030", "#ffffff", 1), "#ffffff");
  assert.equal(rgbToHex(hexToRgb("#1a2b3c")), "#1a2b3c");
  assert.equal(rgbToHex([300, -5, 12.4]), "#ff000c");
});

test("ensureContrast leaves good colours alone and fixes bad ones in the right direction", () => {
  assert.equal(ensureContrast("#ffffff", ["#000000"], 7), "#ffffff");
  const lighter = ensureContrast("#444444", ["#222222"], 4.5); // dark bg -> lighten
  assert.ok(contrastRatio(lighter, "#222222") >= 4.5);
  assert.ok(lighter > "#444444");
  const darker = ensureContrast("#bbbbbb", ["#ffffff"], 4.5); // light bg -> darken
  assert.ok(contrastRatio(darker, "#ffffff") >= 4.5);
  assert.ok(darker < "#bbbbbb");
  // mixed backgrounds still end up with the best available extreme
  const both = ensureContrast("#808080", ["#000000", "#ffffff"], 4.5);
  assert.ok(contrastRatio(both, "#000000") >= 4.5 && contrastRatio(both, "#ffffff") >= 4.5);
});

// Real-world-ish themes (author-chosen base colours; values from the published palettes).
const REAL: Record<string, { base: BaseColors; dark: boolean }> = {
  dracula: { dark: true, base: { background: "#282a36", foreground: "#f8f8f2", accent: "#bd93f9", danger: "#ff5555", success: "#50fa7b", warning: "#f1fa8c", character: "#8be9fd", place: "#50fa7b", muted: "#6272a4" } },
  solarizedDark: { dark: true, base: { background: "#002b36", foreground: "#839496", accent: "#268bd2", danger: "#dc322f", success: "#859900", warning: "#b58900" } },
  solarizedLight: { dark: false, base: { background: "#fdf6e3", foreground: "#657b83", accent: "#268bd2", danger: "#dc322f", success: "#859900", warning: "#b58900" } },
  tokyoNight: { dark: true, base: { background: "#1a1b26", foreground: "#a9b1d6", accent: "#7aa2f7", danger: "#f7768e", success: "#9ece6a", warning: "#e0af68" } },
  catppuccinLatte: { dark: false, base: { background: "#eff1f5", foreground: "#4c4f69", accent: "#8839ef", danger: "#d20f39", success: "#40a02b", warning: "#df8e1d", panel: "#e6e9ef" } },
  githubLight: { dark: false, base: { background: "#ffffff", foreground: "#24292f", accent: "#0969da", danger: "#cf222e", success: "#1a7f37", warning: "#9a6700" } },
  nord: { dark: true, base: { background: "#2e3440", foreground: "#d8dee9", accent: "#88c0d0", danger: "#bf616a", success: "#a3be8c", warning: "#ebcb8b" } },
  lowContrastGrey: { dark: false, base: { background: "#cccccc", foreground: "#bbbbbb", accent: "#dddddd" } },
  allBlack: { dark: true, base: { background: "#000000", foreground: "#000000", accent: "#000000" } },
  allWhite: { dark: false, base: { background: "#ffffff", foreground: "#ffffff", accent: "#ffffff" } },
};

test("generated palettes are complete and pass every contrast rule (real themes + pathological ones)", () => {
  for (const [name, { base, dark }] of Object.entries(REAL)) {
    const p = buildPalette(base, dark);
    assert.ok(isPalette(p), name);
    assert.deepEqual(contrastReport(p), [], name);
  }
});

test("property: 400 random base colours always give a readable palette", () => {
  let seed = 123456789;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const col = () => rgbToHex([rnd() * 255, rnd() * 255, rnd() * 255]);
  for (let i = 0; i < 400; i++) {
    const dark = rnd() < 0.5;
    const base: BaseColors = { background: col(), foreground: col(), accent: col() };
    if (rnd() < 0.5) Object.assign(base, { danger: col(), success: col(), warning: col(), character: col(), place: col(), highlight: col() });
    const p = buildPalette(base, dark);
    assert.deepEqual(contrastReport(p), [], JSON.stringify({ base, dark }));
    assert.ok(isPalette(p));
  }
});

test("good base colours are kept as given", () => {
  const p = buildPalette(REAL.dracula.base, true);
  assert.equal(p["bg"], "#282a36");
  assert.equal(p["accent"], "#bd93f9");
  assert.equal(p["char"], "#8be9fd");
  assert.equal(p["place"], "#50fa7b");
});

test("explicit surfaces are respected, overrides win over everything", () => {
  const p = buildPalette({ ...REAL.githubLight.base, panel: "#f6f8fa", border: "#d0d7de" }, false, { "accent": "#ff0000" });
  assert.equal(p["bg-panel"], "#f6f8fa");
  assert.equal(p["border"], "#d0d7de");
  assert.equal(p["accent"], "#ff0000");
});

test("built-in palettes pass isPalette; broken ones don't", () => {
  for (const t of THEMES) assert.ok(isPalette(t.palette), t.id);
  assert.equal(isPalette(null), false);
  assert.equal(isPalette({}), false);
  assert.equal(isPalette({ ...THEMES[0].palette, bg: "red" }), false);
  const missing = { ...THEMES[0].palette } as Record<string, string>;
  delete missing[THEME_TOKENS[3]];
  assert.equal(isPalette(missing), false);
});
