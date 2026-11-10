import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { htmlToBlocks, decodeEntities, runsToText } from "../src/lib/export/html.ts";
import { makeZip, crc32 } from "../src/lib/export/zip.ts";
import { hasTool } from "./tools.ts";

// Needs Info-ZIP `unzip` and python; Windows consoles also mangle the non-ASCII name it prints.
const realZipTools = process.platform !== "win32" && hasTool("unzip", ["-v"]) && hasTool("python3");

// ── html -> blocks ────────────────────────────────────────────

const text = (b: ReturnType<typeof htmlToBlocks>[number]) => ("runs" in b ? runsToText(b.runs) : "");

test("paragraphs, with inline formatting merged and nested", () => {
  const b = htmlToBlocks("<p>Hello <strong>bold <em>and italic</em></strong> world</p><p>Two</p>");
  assert.equal(b.length, 2);
  assert.deepEqual((b[0] as any).runs, [
    { text: "Hello " },
    { text: "bold ", bold: true },
    { text: "and italic", bold: true, italic: true },
    { text: " world" },
  ]);
});

test("adjacent runs with identical formatting are merged (split by editor marks)", () => {
  const b = htmlToBlocks("<p>Shep<strong>her</strong><strong>d</strong> Boy</p>");
  assert.deepEqual((b[0] as any).runs, [{ text: "Shep" }, { text: "herd", bold: true }, { text: " Boy" }]);
});

test("headings, quotes, lists (ordered numbering), rules, hard breaks", () => {
  const b = htmlToBlocks(
    "<h2>Part</h2><blockquote><p>Said</p><p>Again</p></blockquote>" +
    "<ul><li><p>a</p></li><li><p>b</p></li></ul><ol><li>x</li><li>y</li></ol><hr><p>l1<br>l2</p>"
  );
  assert.deepEqual(b.map((x) => x.type), ["h", "quote", "quote", "li", "li", "li", "li", "hr", "p"]);
  assert.equal((b[0] as any).level, 2);
  assert.deepEqual(b.filter((x) => x.type === "li").map((x: any) => [x.ordered, x.index]), [[false, 1], [false, 2], [true, 1], [true, 2]]);
  assert.equal(text(b[8]), "l1\nl2");
});

test("legacy plain-text scenes: blank line = paragraph, single newline = line break", () => {
  const b = htmlToBlocks("First para\nstill first.\n\nSecond   para.\r\n\r\n\r\nThird.");
  assert.deepEqual(b.map(text), ["First para\nstill first.", "Second   para.", "Third."]);
});

test("entities are decoded; empty paragraphs and whitespace-only blocks are dropped", () => {
  assert.equal(decodeEntities("A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39; &#233; &#x1F600; &nbsp;x &bogus;"), 'A & B <c> "d" \'e\' é 😀  x &bogus;');
  assert.deepEqual(htmlToBlocks("<p></p><p>  </p><p>Real</p>").map(text), ["Real"]);
  assert.deepEqual(htmlToBlocks("   "), []);
  assert.deepEqual(htmlToBlocks(""), []);
});

test("unknown tags keep their text; stray '<' survives; text outside blocks becomes a paragraph", () => {
  assert.deepEqual(htmlToBlocks("<p>a <span class='x'>b</span> <a href='#'>c</a></p>").map(text), ["a b c"]);
  assert.deepEqual(htmlToBlocks("<p>1 < 2</p>").map(text), ["1 < 2"]);
  assert.deepEqual(htmlToBlocks("loose <em>text</em> here<p>next</p>").map(text), ["loose text here", "next"]);
});

test("accents and emoji pass through untouched", () => {
  assert.deepEqual(htmlToBlocks("<p>José — “olá” 😀</p>").map(text), ["José — “olá” 😀"]);
});

// ── zip ───────────────────────────────────────────────────────

test("crc32 matches the well-known check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("makeZip output is a valid archive that real tools read back byte-for-byte", { skip: !realZipTools && "needs unzip + python3 (non-Windows)" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "fab-zip-"));
  const bin = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 256);
  const zip = makeZip(
    [
      { name: "mimetype", data: "application/epub+zip" },
      { name: "dir/olá-ção.txt", data: "Unicode name ✓" },
      { name: "empty.txt", data: "" },
      { name: "blob.bin", data: bin },
    ],
    new Date(2026, 10, 6, 12, 30, 10)
  );
  const file = join(dir, "t.zip");
  writeFileSync(file, zip);

  assert.match(execFileSync("unzip", ["-t", file]).toString(), /No errors detected/);
  const listing = execFileSync("unzip", ["-Z1", file]).toString().split("\n").filter(Boolean);
  assert.deepEqual(listing, ["mimetype", "dir/olá-ção.txt", "empty.txt", "blob.bin"]); // order kept
  assert.equal(execFileSync("unzip", ["-p", file, "mimetype"]).toString(), "application/epub+zip");
  assert.equal(execFileSync("unzip", ["-p", file, "dir/olá-ção.txt"]).toString(), "Unicode name ✓");
  assert.deepEqual(new Uint8Array(execFileSync("unzip", ["-p", file, "blob.bin"])), bin);
  // python's strict reader agrees too
  const py = execFileSync("python3", ["-c", `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print(z.getinfo('mimetype').compress_type)`, file]).toString().trim().split("\n");
  assert.deepEqual(py, ["None", "0"]);
});
