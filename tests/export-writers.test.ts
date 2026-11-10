import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exportProject, DEFAULT_OPTIONS, exportPreview } from "../src/lib/export/index.ts";
import type { Project } from "../src/lib/types.ts";
import { hasTool } from "./tools.ts";

const docxTools = hasTool("python3", ["-c", "import docx"]) && hasTool("soffice") && hasTool("cat");
const epubTools = hasTool("unzip", ["-v"]) && hasTool("xmllint") && hasTool("pandoc");

const sc = (id: string, ch: string, order: number, title: string, content: string) => ({
  id, title, summary: "", content, chapter_id: ch, order, plotline_id: "pl", character_ids: [], place_ids: [], tags: [],
});
const project = {
  schema_version: 3, id: "p1", title: "A Fábula & Co <1>", premise: "", genre: "", theme: "",
  chapters: [
    { id: "c1", title: "O Pastor", summary: "" },
    { id: "c2", title: "Empty", summary: "" },
    { id: "c3", title: "The Wolf", summary: "" },
  ],
  scenes: [
    sc("s1", "c1", 0, "Hills", "<p>José said “olá” &amp; left. <strong>Bold</strong> <em>it</em></p><p>Second *star* _under_.</p>"),
    sc("s2", "c1", 1, "Village", "<h2>Sub</h2><blockquote><p>Quote</p></blockquote><ul><li><p>one</p></li><li><p>two</p></li></ul>"),
    sc("s3", "c3", 0, "Night", "Legacy plain\nline two.\n\nPara two 😀"),
    sc("s4", "c3", 1, "Blank", "<p></p>"),
  ],
  snapshots: [], characters: [], places: [], notes: [], plotlines: [],
} as unknown as Project;

const dir = mkdtempSync(join(tmpdir(), "fab-exp-"));
const opts = (o = {}) => ({ ...DEFAULT_OPTIONS, author: "Ana Autora", ...o });
const write = (name: string, b: Uint8Array) => { const p = join(dir, name); writeFileSync(p, b); return p; };
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: "utf8" });

test("counts skip empty chapters and empty scenes", () => {
  assert.deepEqual(exportPreview(project, opts()), { scenes: 3, chapters: 2 });
  assert.deepEqual(exportPreview(project, opts({ scope: "chapter", sceneId: "s3" })), { scenes: 1, chapters: 1 });
  assert.deepEqual(exportPreview(project, opts({ scope: "scene", sceneId: "s2" })), { scenes: 1, chapters: 1 });
  assert.deepEqual(exportPreview(project, opts({ scope: "scene", sceneId: "nope" })), { scenes: 0, chapters: 0 });
});

test("markdown: structure, escaping, breaks", () => {
  const r = exportProject(project, opts({ format: "markdown" }));
  const md = new TextDecoder().decode(r.bytes);
  assert.equal(r.fileName, "A Fábula & Co 1.md");
  assert.match(md, /^# A Fábula & Co \\<1\\>\n\n\*Ana Autora\*\n\n## O Pastor/);
  assert.match(md, /José said “olá” & left\. \*\*Bold\*\* \*it\*/);
  assert.match(md, /Second \\\*star\\\* \\_under\\_\./);
  assert.match(md, /\* \* \*\n\n### Sub/);
  assert.match(md, /> Quote/);
  assert.match(md, /- one\n\n- two/);
  assert.match(md, /Legacy plain {2}\nline two\./);
  assert.ok(!md.includes("Empty"));
});

test("markdown/text options: scene titles replace breaks; no chapter headings", () => {
  const md = new TextDecoder().decode(exportProject(project, opts({ format: "markdown", sceneTitles: true, chapterHeadings: false })).bytes);
  assert.match(md, /### Hills/);
  assert.ok(!md.includes("## O Pastor") && !md.includes("* * *"));
  const tx = new TextDecoder().decode(exportProject(project, opts({ format: "text", sceneBreak: "none" })).bytes);
  assert.match(tx, /^A FÁBULA & CO <1>\n\nby Ana Autora\n\nO Pastor\n\n/);
  assert.ok(!tx.includes("* * *"));
});

test("docx: opens in python-docx and LibreOffice, content intact", { skip: !docxTools && "needs python-docx + LibreOffice" }, () => {
  const r = exportProject(project, opts({ format: "docx" }));
  const f = write("t.docx", r.bytes);
  const py = run("python3", ["-c", `
import sys,docx
d=docx.Document(sys.argv[1])
print(d.core_properties.title,'|',d.core_properties.author)
for p in d.paragraphs: print(p.style.name,'|',p.text)
s=d.sections[0]; print(s.page_width.twips,s.page_height.twips)
`, f]);
  assert.match(py, /^A Fábula & Co <1> \| Ana Autora/);
  assert.match(py, /Heading 1 \| O Pastor/);
  assert.match(py, /First Paragraph \| José said “olá” & left\. Bold it/);
  assert.match(py, /Scene Break \| \* \* \*/);
  assert.match(py, /List Paragraph \| •\tone/);
  assert.match(py, /Legacy plain\nline two\./);
  assert.match(py, /Para two 😀/);
  assert.match(py, /11906 16838/);
  const letter = run("python3", ["-c", "import sys,docx;s=docx.Document(sys.argv[1]).sections[0];print(s.page_width.twips)", write("l.docx", exportProject(project, opts({ format: "docx", pageSize: "letter" })).bytes)]);
  assert.equal(letter.trim(), "12240");
  // LibreOffice converts it to text without complaint
  run("soffice", ["--headless", "--convert-to", "txt:Text", "--outdir", dir, f]);
  assert.match(run("cat", [join(dir, "t.txt")]), /Second \*star\* _under_\./);
});

test("epub: valid zip layout, well-formed XML, pandoc reads it", { skip: !epubTools && "needs unzip + xmllint + pandoc" }, () => {
  const r = exportProject(project, opts({ format: "epub" }));
  const f = write("t.epub", r.bytes);
  assert.equal(run("unzip", ["-Z1", f]).split("\n")[0], "mimetype");
  for (const x of ["META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/toc.ncx", "OEBPS/title.xhtml", "OEBPS/chapter1.xhtml", "OEBPS/chapter2.xhtml"]) {
    execFileSync("sh", ["-c", `unzip -p "${f}" "${x}" | xmllint --noout -`]);
  }
  const md = run("pandoc", [f, "-t", "plain", "--wrap=none"]);
  assert.match(md, /O Pastor/);
  assert.match(md, /José said “olá” & left\./);
  assert.match(md, /The Wolf/);
  assert.ok(!md.includes("Empty"));
  assert.match(run("pandoc", [f, "--template=/dev/stdin", "-t", "plain"].slice(0, 0).concat(["-f", "epub", "-t", "json", f]), ).slice(0, 1), /\{/);
});
