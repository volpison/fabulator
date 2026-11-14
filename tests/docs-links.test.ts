import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const markdown = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? markdown(p) : n.endsWith(".md") ? [p] : [];
  });
const files = [join(root, "README.md"), join(root, "ROADMAP.md"), ...markdown(join(root, "docs"))];

/** Headings as GitHub makes anchors from them. */
const anchors = (text: string) =>
  new Set(
    text
      .split("\n")
      .filter((l) => /^#{1,6} /.test(l))
      .map((l) => l.replace(/^#+ /, "").toLowerCase().replace(/[`*_]/g, "").replace(/[^\p{L}\p{N} -]/gu, "").trim().replace(/ /g, "-"))
  );

test("every relative link in the README, ROADMAP and docs points at a file (and heading) that exists", () => {
  const broken: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = m[1];
      if (/^(https?:|mailto:)/.test(link)) continue;
      const [path, hash] = link.split("#");
      const target = path ? resolve(dirname(file), path) : file;
      if (!existsSync(target)) { broken.push(`${file.slice(root.length + 1)}: ${link}`); continue; }
      if (hash && target.endsWith(".md") && !anchors(readFileSync(target, "utf8")).has(hash)) broken.push(`${file.slice(root.length + 1)}: ${link} (no such heading)`);
    }
  }
  assert.deepEqual(broken, []);
});

test("the docs index lists every page under docs/", () => {
  const index = readFileSync(join(root, "docs/index.md"), "utf8");
  const missing = markdown(join(root, "docs"))
    .map((p) => p.slice(join(root, "docs").length + 1).replace(/\\/g, "/")) // Windows paths use backslashes
    .filter((p) => p !== "index.md" && !index.includes(`(${p})`));
  assert.deepEqual(missing, []);
});
