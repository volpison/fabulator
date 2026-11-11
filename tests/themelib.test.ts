import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planFolderImport, filterThemes, collectionsOf, countByMode, collectionNameFromFolder,
  BUILT_IN, IMPORTED, MAX_FOLDER_THEMES,
} from "../src/lib/themelib.ts";
import { importThemeText, specToTheme, serializeSpec, cleanCollection } from "../src/lib/theme-file.ts";
import { THEMES, contrastReport } from "../src/lib/themes.ts";

const b16 = (name: string, bg: string, fg: string, extra = "") => `scheme: "${name}"
author: "Tester"
base00: "${bg}"
base01: "${bg}"
base02: "404040"
base03: "606060"
base04: "909090"
base05: "${fg}"
base06: "dddddd"
base07: "ffffff"
base08: "ff5555"
base09: "ff8800"
base0A: "ffcc00"
base0B: "55cc55"
base0C: "55cccc"
base0D: "5588ff"
base0E: "aa66ff"
base0F: "aa5533"
${extra}`;
const base24 = (name: string) => b16(name, "101010", "e0e0e0", `base10: "080808"\nbase11: "000000"\nbase12: "ff0000"\nbase13: "ffff00"\nbase14: "00ff00"\nbase15: "00ffff"\nbase16: "0000ff"\nbase17: "ff00ff"\nsystem: "base24"`);

const builtIns = new Set(THEMES.map((t) => t.id));

test("Base24 schemes are recognised; base10 becomes the sidebar of dark schemes", () => {
  const r = importThemeText(base24("Night 24"));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.source, "base24");
    assert.equal(r.spec.dark, true);
    assert.equal(r.spec.colors.sidebar, "#080808");
  }
  const plain = importThemeText(b16("Night 16", "101010", "e0e0e0"));
  assert.ok(plain.ok && plain.source === "base16" && plain.spec.colors.sidebar !== "#080808");
});

test("collection names are cleaned and survive a save/load", () => {
  assert.equal(cleanCollection("  My   folder \n"), "My folder");
  assert.equal(cleanCollection("x".repeat(80))!.length, 60);
  assert.equal(cleanCollection(5), undefined);
  assert.equal(cleanCollection("   "), undefined);
  const r = importThemeText(b16("A", "101010", "e0e0e0"));
  assert.ok(r.ok);
  if (r.ok) {
    const text = serializeSpec({ ...r.spec, collection: "Tinted" });
    const back = importThemeText(text);
    assert.ok(back.ok && back.spec.collection === "Tinted");
    assert.equal(specToTheme(back.spec as never).collection, "Tinted");
  }
});

test("a folder of mixed files: imports the themes, reports the rest", () => {
  const plan = planFolderImport(
    [
      { name: "base16/one.yaml", text: b16("One Dark-ish", "1e1e1e", "dddddd") },
      { name: "base16/two.yml", text: b16("Two Light-ish", "f5f5f5", "222222", 'variant: "light"') },
      { name: "base24/three.yaml", text: base24("Three") },
      { name: "README.md", text: "# hello" },                    // not a theme file: ignored silently
      { name: "broken.yaml", text: "name: x\nbase00: nope" },    // reported
      { name: "notes.json", text: "{ not json" },                // reported
    ],
    "tinted",
    []
  );
  assert.deepEqual(plan.items.map((i) => i.spec.name), ["One Dark-ish", "Two Light-ish", "Three"]);
  assert.deepEqual(plan.items.map((i) => i.spec.collection), ["tinted", "tinted", "tinted"]);
  assert.deepEqual(plan.items.map((i) => i.spec.dark), [true, false, true]);
  assert.deepEqual(plan.items.map((i) => i.fileName), ["one-dark-ish.json", "two-light-ish.json", "three.json"]);
  assert.deepEqual(plan.skipped.map((s) => s.name).sort(), ["broken.yaml", "notes.json"]);
  assert.equal(plan.renamed, 0);
});

test("never replaces an installed theme: identical = skipped, same name = renamed", () => {
  const first = planFolderImport([{ name: "a.yaml", text: b16("Same Name", "101010", "eeeeee") }], "c", []);
  const installed = first.items.map((i) => specToTheme(i.spec));

  const again = planFolderImport([{ name: "a.yaml", text: b16("Same Name", "101010", "eeeeee") }], "c", installed);
  assert.equal(again.items.length, 0);
  assert.match(again.skipped[0].reason, /already installed/);

  const variant = planFolderImport([{ name: "b.yaml", text: b16("Same Name", "202020", "eeeeee") }], "c", installed);
  assert.deepEqual(variant.items.map((i) => i.spec.name), ["Same Name (2)"]);
  assert.equal(variant.renamed, 1);

  const b24 = planFolderImport([{ name: "c.yaml", text: base24("Same Name") }], "c", installed);
  assert.deepEqual(b24.items.map((i) => i.spec.name), ["Same Name (Base24)"]);
});

test("duplicates inside one folder get distinct names and file names", () => {
  const files = [1, 2, 3].map((n) => ({ name: `d${n}.yaml`, text: b16("Dup", `1${n}1${n}1${n}`, "eeeeee") }));
  const plan = planFolderImport(files, "c", []);
  assert.deepEqual(plan.items.map((i) => i.spec.name), ["Dup", "Dup (2)", "Dup (3)"]);
  assert.equal(new Set(plan.items.map((i) => i.fileName)).size, 3);
});

test("imported ids live apart from built-in ones, so a built-in is never replaced", () => {
  const dark = THEMES.find((t) => t.id === "dark")!;
  const plan = planFolderImport([{ name: "x.yaml", text: b16("dark", "123456", "eeeeee") }], "c", [dark]);
  assert.equal(plan.items.length, 1);
  assert.equal(specToTheme(plan.items[0].spec).id, "user:dark");
});

test("the per-import limit is enforced", () => {
  const files = Array.from({ length: MAX_FOLDER_THEMES + 5 }, (_, i) => ({ name: `t${i}.yaml`, text: b16(`T${i}`, "101010", "eeeeee", `# ${i}`) }));
  const plan = planFolderImport(files, "c", []);
  assert.equal(plan.items.length, MAX_FOLDER_THEMES);
  assert.equal(plan.skipped.length, 5);
});

const sample = () => {
  const mk = (n: string, bg: string, fg: string, coll?: string) => {
    const r = importThemeText(b16(n, bg, fg));
    if (!r.ok) throw new Error(r.error);
    return specToTheme({ ...r.spec, collection: coll });
  };
  return [...THEMES, mk("Ocean Night", "0a1a2a", "e0f0ff", "Tinted"), mk("Ocean Day", "f0f8ff", "102030", "Tinted"), mk("Forest", "102010", "e0ffe0"), mk("Gallery One", "f5f0e0", "302820", "Gallery")];
};

test("filters: dark / light / search / collection combine", () => {
  const all = sample();
  const names = (f: Parameters<typeof filterThemes>[1]) => filterThemes(all, f, builtIns).map((t) => t.label);
  assert.ok(names({ mode: "all", query: "", collection: "" }).length === all.length);
  assert.deepEqual(names({ mode: "light", query: "ocean", collection: "" }), ["Ocean Day"]);
  assert.deepEqual(names({ mode: "dark", query: "ocean", collection: "" }), ["Ocean Night"]);
  assert.deepEqual(names({ mode: "all", query: "", collection: "Tinted" }), ["Ocean Night", "Ocean Day"]);
  assert.deepEqual(names({ mode: "all", query: "", collection: IMPORTED }), ["Forest"]);
  assert.deepEqual(names({ mode: "light", query: "", collection: "Gallery" }), ["Gallery One"]);
  assert.deepEqual(names({ mode: "all", query: "  FOREST ", collection: "" }), ["Forest"]);
  assert.equal(names({ mode: "all", query: "zzz", collection: "" }).length, 0);
});

test("counts and collections", () => {
  const all = sample();
  const c = countByMode(all);
  assert.equal(c.dark + c.light, c.all);
  assert.deepEqual(collectionsOf(all, builtIns).map((x) => x.name), [BUILT_IN, "Gallery", "Tinted", IMPORTED]);
  assert.equal(collectionsOf(all, builtIns).find((x) => x.name === "Tinted")!.count, 2);
});

test("collection name from a folder path", () => {
  assert.equal(collectionNameFromFolder("base16"), "base16");
  assert.equal(collectionNameFromFolder("Tinted Pack"), "Tinted Pack");
  assert.equal(collectionNameFromFolder("/"), "Imported");
});

import { readFileSync, readdirSync } from "node:fs";

test("the bundled example folder imports: 3 themes, dark and light, Base16 and Base24", () => {
  const root = "themes/examples/folder-sample";
  const files = ["base16", "base24"].flatMap((d) =>
    readdirSync(`${root}/${d}`).map((f) => ({ name: `${d}/${f}`, text: readFileSync(`${root}/${d}/${f}`, "utf8") }))
  );
  const plan = planFolderImport(files, "folder-sample", []);
  assert.deepEqual(plan.skipped, []);
  assert.deepEqual(plan.items.map((i) => [i.spec.name, i.spec.dark, i.source]).sort(), [
    ["Orchard Dusk", true, "base16"],
    ["Orchard Morning", false, "base16"],
    ["Orchard Night", true, "base24"],
  ]);
  const night = plan.items.find((i) => i.spec.name === "Orchard Night")!;
  assert.equal(night.spec.colors.sidebar, "#0d0f14");
  for (const i of plan.items) {
    const info = specToTheme(i.spec);
    assert.deepEqual(contrastReport(info.palette), [], i.spec.name);
  }
  // importing the same folder again adds nothing
  const installed = plan.items.map((i) => specToTheme(i.spec));
  assert.equal(planFolderImport(files, "folder-sample", installed).items.length, 0);
});

test("a folder of 400 schemes plans quickly", () => {
  const files = Array.from({ length: 400 }, (_, i) => ({
    name: `base16/s${i}.yaml`,
    text: b16(`Scheme ${i}`, (0x101010 + i * 997).toString(16).padStart(6, "0").slice(-6), "e8e8e8"),
  }));
  const t0 = Date.now();
  const plan = planFolderImport(files, "big", []);
  assert.equal(plan.items.length, 400);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
});
