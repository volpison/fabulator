import { test } from "node:test";
import assert from "node:assert/strict";
import { GALLERY, galleryFamilies } from "../src/lib/gallery.ts";
import { specToTheme, importThemeText, serializeSpec, slugify, themeIdFor } from "../src/lib/theme-file.ts";
import { normalizeHex } from "../src/lib/themegen.ts";
import { THEMES, contrastReport, isPalette, luminance } from "../src/lib/themes.ts";

test("names, ids and file names are unique and do not clash with built-in themes", () => {
  const names = GALLERY.map((g) => g.spec.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(names.map(slugify)).size, names.length);
  const builtIn = new Set(THEMES.map((t) => t.id));
  for (const n of names) assert.equal(builtIn.has(themeIdFor(n)), false, n);
});

test("every entry has credit, licence, source and valid colours", () => {
  for (const g of GALLERY) {
    assert.ok(g.family && g.license && g.source && g.spec.author, g.spec.name);
    for (const [k, v] of Object.entries(g.spec.colors)) {
      assert.ok(normalizeHex(v as string), `${g.spec.name}.${k} = ${v}`);
    }
  }
});

test("declared dark/light matches the background", () => {
  for (const g of GALLERY) {
    assert.equal(luminance(g.spec.colors.background) < 0.4, g.spec.dark, g.spec.name);
  }
});

test("every gallery theme builds a complete palette that passes the contrast rules", () => {
  for (const g of GALLERY) {
    const info = specToTheme(g.spec);
    assert.ok(isPalette(info.palette), g.spec.name);
    assert.deepEqual(contrastReport(info.palette), [], g.spec.name);
  }
});

test("a saved gallery theme re-imports to the same theme", () => {
  for (const g of GALLERY) {
    const r = importThemeText(serializeSpec(g.spec));
    assert.ok(r.ok, g.spec.name);
    if (r.ok) assert.deepEqual(specToTheme(r.spec).palette, specToTheme(g.spec).palette, g.spec.name);
  }
});

test("families group in order and cover everything", () => {
  const groups = galleryFamilies();
  assert.equal(groups.reduce((n, g) => n + g.themes.length, 0), GALLERY.length);
  assert.equal(groups.find((g) => g.family === "Catppuccin")!.themes.length, 4);
  assert.ok(GALLERY.some((g) => g.spec.dark) && GALLERY.some((g) => !g.spec.dark));
});
