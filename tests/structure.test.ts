// The folders in src/lib are layers: a folder may import only from the folders
// listed for it here (see docs/technical/frontend-structure.md). This keeps the
// structure from quietly rotting, and keeps circular imports out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";

const LIB = "src/lib";

const ALLOWED: Record<string, string[]> = {
  files: ["app", "comic", "export", "game", "model", "platform", "screenplay"],
  editor: ["appearance", "model", "tools"],
  app: ["comic", "game", "model", "platform", "screenplay", "tools"],
  tools: ["comic", "export", "game", "model", "screenplay"],
  export: ["comic", "game", "model", "screenplay"],
  game: ["model"],
  comic: ["model"],
  screenplay: ["model"],
  appearance: ["platform"],
  platform: ["model"],
  model: [],
};


function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']*)["']/g;

/** Every import in src/lib as [from file, to file], both relative to src/lib. */
function edges(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const file of listTs(LIB)) {
    const rel = file.slice(LIB.length + 1).split(sep).join("/");
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT)) {
      const target = normalize(join(file, "..", m[1])).split(sep).join("/");
      if (!target.startsWith(LIB + "/")) continue; // components, tests…: not our business
      out.push([rel, target.slice(LIB.length + 1)]);
    }
  }
  return out;
}

const folderOf = (rel: string) => rel.split("/")[0];

test("src/lib has no loose files: every file sits in a known folder", () => {
  const loose = readdirSync(LIB).filter((n) => statSync(join(LIB, n)).isFile());
  assert.deepEqual(loose, []);
  for (const file of listTs(LIB)) {
    const folder = file.slice(LIB.length + 1).split(sep)[0];
    assert.ok(folder in ALLOWED, `${file}: "${folder}" is not a known folder`);
  }
});

test("a folder in src/lib imports only from the folders below it", () => {
  const bad: string[] = [];
  for (const [from, to] of edges()) {
    const a = folderOf(from);
    const b = folderOf(to);
    if (a === b || ALLOWED[a]?.includes(b)) continue;
    bad.push(`${from} -> ${to}`);
  }
  assert.deepEqual(bad, [], "folder imports that break the layers (see docs/technical/frontend-structure.md)");
});

test("the allowed folder imports have no loops", () => {
  const seen = new Set<string>();
  const stack: string[] = [];
  const visit = (f: string) => {
    assert.ok(!stack.includes(f), `loop: ${[...stack, f].join(" -> ")}`);
    if (seen.has(f)) return;
    seen.add(f);
    stack.push(f);
    for (const g of ALLOWED[f]) visit(g);
    stack.pop();
  };
  Object.keys(ALLOWED).forEach(visit);
});

test("src/lib never imports a component", () => {
  const bad = listTs(LIB).filter((f) => /\.\.\/components\//.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});

// ---- src/components -------------------------------------------------------
// Each component folder is self-contained: only App.svelte puts them together.
const COMPONENTS = "src/components";
const COMPONENT_FOLDERS = ["shell", "novel", "comic", "screenplay", "game", "dialogs"];

function listSvelte(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listSvelte(p));
    else if (name.endsWith(".svelte")) out.push(p);
  }
  return out;
}

test("src/components has no loose files: every component sits in a known folder", () => {
  const loose = readdirSync(COMPONENTS).filter((n) => statSync(join(COMPONENTS, n)).isFile());
  assert.deepEqual(loose, []);
  assert.deepEqual(readdirSync(COMPONENTS).sort(), [...COMPONENT_FOLDERS].sort());
});

test("a component never imports a component from another folder", () => {
  const bad: string[] = [];
  for (const file of listSvelte(COMPONENTS)) {
    const folder = file.slice(COMPONENTS.length + 1).split(sep)[0];
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const target = normalize(join(file, "..", m[1])).split(sep).join("/");
      if (!target.startsWith(COMPONENTS + "/")) continue;
      if (target.slice(COMPONENTS.length + 1).split("/")[0] !== folder) bad.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(bad, [], "components may only import components of their own folder");
});

// ---- src/lib/app/stores ---------------------------------------------------
// `stores.ts` was split by what each part is for. `core` is the base; no loops.
test("the store modules import each other without loops, and core imports none", () => {
  const dir = "src/lib/app/stores";
  const names = readdirSync(dir).filter((n) => n.endsWith(".ts")).map((n) => n.slice(0, -3));
  const deps = new Map<string, string[]>();
  for (const n of names) {
    const text = readFileSync(join(dir, n + ".ts"), "utf8");
    deps.set(n, [...text.matchAll(/from\s+"\.\/(\w+)"/g)].map((m) => m[1]));
  }
  assert.deepEqual(deps.get("core"), []);
  const seen = new Set<string>();
  const stack: string[] = [];
  const visit = (n: string) => {
    assert.ok(!stack.includes(n), `loop: ${[...stack, n].join(" -> ")}`);
    if (seen.has(n)) return;
    seen.add(n);
    stack.push(n);
    for (const d of deps.get(n) ?? []) visit(d);
    stack.pop();
  };
  names.forEach(visit);
});
