import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToBlocks } from "../src/lib/export/html.ts";
import { blocksToMd, mdToBlocks, mdToHtml, htmlToMd, parseInline } from "../src/lib/mdbody.ts";

/** html -> blocks -> markdown -> html -> blocks must give the same blocks. */
const roundTrip = (html: string) => {
  const before = htmlToBlocks(html);
  const md = blocksToMd(before);
  const after = htmlToBlocks(mdToHtml(md));
  assert.deepEqual(after, before, `markdown was:\n${md}`);
  // and the markdown itself is stable
  assert.equal(htmlToMd(mdToHtml(md)), md);
  return md;
};

test("plain paragraphs and formatting", () => {
  const md = roundTrip("<p>One <strong>bold</strong>, <em>italic</em>, <s>gone</s>, <strong><em>both</em></strong>.</p><p>Two.</p>");
  assert.equal(md, "One **bold**, *italic*, ~~gone~~, ***both***.\n\nTwo.");
});

test("headings, quotes, rules", () => {
  const md = roundTrip("<h2>Part one</h2><p>text</p><h3>Sub</h3><blockquote><p>wise words</p></blockquote><hr><p>after</p>");
  assert.match(md, /^## Part one\n\ntext\n\n### Sub\n\n> wise words\n\n---\n\nafter$/);
});

test("lists stay tight and keep their numbers", () => {
  const md = roundTrip("<ul><li><p>a</p></li><li><p>b</p></li></ul><p>x</p><ol><li><p>one</p></li><li><p>two</p></li><li><p>three</p></li></ol>");
  assert.equal(md, "- a\n- b\n\nx\n\n1. one\n2. two\n3. three");
});

test("text that looks like Markdown is escaped and comes back unchanged", () => {
  for (const t of [
    "1. not a list", "- dash start", "+ plus", "# not a heading", "## nor this", "---", "***", "___",
    "*star* and **stars**", "snake_case_name", "[link](http://x.test)", "<tag> & &amp; &lt;", "~~not struck~~",
    "back\\slash \\* and \\n", "> not a quote", "5 * 3 = 15", "a*b*c", "Call #", "100% café — “quotes” ’",
  ]) {
    roundTrip(`<p>${t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`);
  }
});

test("line breaks inside paragraphs, lists and quotes", () => {
  roundTrip("<p>line one<br>line two<br>- not a list<br>3. nor this</p>");
  roundTrip("<ul><li><p>first<br>continued</p></li><li><p>second</p></li></ul>");
  roundTrip("<blockquote><p>a<br>b</p></blockquote>");
});

test("spaces next to formatting move outside the markers but the text is unchanged", () => {
  const html = "<p>word <strong>bold </strong>next <em> it</em>end</p>";
  const text = (bl: ReturnType<typeof htmlToBlocks>) => bl.map((x) => ("runs" in x ? x.runs.map((r) => ("text" in r ? r.text : "\n")).join("") : "")).join("|");
  const before = htmlToBlocks(html);
  const md = blocksToMd(before);
  assert.equal(text(htmlToBlocks(mdToHtml(md))), text(before));
  assert.equal(md, "word **bold** next  *it*end");
});

test("two quotes and two lists in a row stay separate blocks", () => {
  roundTrip("<blockquote><p>a</p></blockquote><blockquote><p>b</p></blockquote>");
  roundTrip("<ul><li><p>a</p></li></ul><ol><li><p>b</p></li></ol>");
});

test("hand-written Markdown is understood", () => {
  const blocks = mdToBlocks("# Title\n\nA wrapped\nparagraph with **bold** and *it*.\n\n* star item\n* another\n  wrapped item\n\n1) one\n2) two\n\n***\n\nEnd  \nhard break\\\nsecond");
  assert.deepEqual(blocks.map((b) => b.type), ["h", "p", "li", "li", "li", "li", "hr", "p"]);
  const p = blocks[1] as { runs: { text?: string }[] };
  assert.equal(p.runs[0].text, "A wrapped paragraph with ");
  const lastRuns = (blocks[7] as { runs: unknown[] }).runs;
  assert.equal(lastRuns.filter((r) => "br" in (r as object)).length, 2);
  assert.equal((blocks[3] as { runs: { text: string }[] }).runs[0].text, "another wrapped item");
});

test("unmatched markers stay literal", () => {
  assert.deepEqual(parseInline("2 * 3 and a* b"), [{ text: "2 * 3 and a* b" }]);
  assert.deepEqual(parseInline("**open only"), [{ text: "open only", bold: true }]);
});

test("empty / junk input", () => {
  assert.deepEqual(mdToBlocks(""), []);
  assert.deepEqual(mdToBlocks("\n\n  \n"), []);
  assert.equal(mdToHtml("   "), "");
  assert.equal(htmlToMd(""), "");
  assert.equal(htmlToMd("Legacy plain text.\n\nSecond paragraph."), "Legacy plain text.\n\nSecond paragraph.");
});
