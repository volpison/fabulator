import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatcher, replaceInHtml, replaceInPlain, planReplace, applyReplace } from "../src/lib/replace.ts";
import type { Project } from "../src/lib/types.ts";

const re = (find: string, o: Partial<{ matchCase: boolean; wholeWord: boolean }> = {}) =>
  buildMatcher(find, { matchCase: false, wholeWord: false, ...o })!;

test("tags and attributes are never touched", () => {
  const html = '<p class="Bob" data-x="Bob">Bob and <a href="/Bob">Bob</a></p>';
  const r = replaceInHtml(html, re("bob"), "Rob");
  assert.equal(r.html, '<p class="Bob" data-x="Bob">Rob and <a href="/Bob">Rob</a></p>');
  assert.equal(r.count, 2);
});

test("a match spanning inline formatting is replaced, keeping the start's formatting", () => {
  const r = replaceInHtml("<p>The Shep<strong>herd</strong> Boy</p>", re("shepherd"), "Pastor");
  assert.equal(r.html, "<p>The Pastor Boy</p>");
  const r2 = replaceInHtml("<p>A <em>red</em> fox</p>", re("red fox"), "wolf");
  assert.equal(r2.html, "<p>A <em>wolf</em></p>");
  assert.equal(r2.count, 1);
});

test("matches never cross paragraphs or line breaks", () => {
  assert.equal(replaceInHtml("<p>red</p><p>fox</p>", re("red fox"), "x").count, 0);
  assert.equal(replaceInHtml("<p>red<br>fox</p>", re("red fox"), "x").count, 0);
});

test("entities: matched on decoded text, re-encoded safely; untouched text stays byte-identical", () => {
  const html = "<p>Tom &amp; Jerry &lt;3 &nbsp;Tom</p>";
  const r = replaceInHtml(html, re("tom &"), "Tom and");
  assert.equal(r.html, "<p>Tom and Jerry &lt;3 &nbsp;Tom</p>");
  const r2 = replaceInHtml("<p>a</p><p>x &amp; y</p>", re("a"), "<b>");
  assert.equal(r2.html, "<p>&lt;b&gt;</p><p>x &amp; y</p>");
  const none = replaceInHtml("<p>x &bogus; y</p>", re("zzz"), "q");
  assert.equal(none.html, "<p>x &bogus; y</p>");
});

test("replacement is literal ($ patterns are not special) and can be empty", () => {
  assert.equal(replaceInHtml("<p>cost</p>", re("cost"), "$& $1 $$").html, "<p>$&amp; $1 $$</p>");
  assert.equal(replaceInHtml("<p>very good</p>", re("very "), "").html, "<p>good</p>");
});

test("case and whole-word options", () => {
  assert.equal(replaceInPlain("Ana ana ANA Joana", re("ana"), "X").text, "X X X JoX");
  assert.equal(replaceInPlain("Ana ana ANA", re("ana", { matchCase: true }), "X").text, "Ana X ANA");
  assert.equal(replaceInPlain("Ana ana Joana Anão", re("ana", { wholeWord: true }), "X").text, "X X Joana Anão");
  assert.equal(replaceInPlain("José Jose", re("jose"), "X").text, "José X"); // accents matter
  assert.equal(replaceInPlain("café, cafés", re("café", { wholeWord: true }), "X").text, "X, cafés");
});

test("whole-word is skipped on edges that aren't word characters; special chars are literal", () => {
  assert.equal(replaceInPlain("a (b) a.b", re("(b)", { wholeWord: true }), "X").text, "a X a.b");
  assert.equal(replaceInPlain("1+1=2 and 1+1", re("1+1"), "two").text, "two=2 and two");
  assert.equal(buildMatcher("", { matchCase: false, wholeWord: false }), null);
});

test("legacy plain-text scenes are replaced as plain text", () => {
  const r = replaceInHtml("Bob went.\n\nBob came.", re("bob"), "Rob");
  assert.deepEqual([r.html, r.count], ["Rob went.\n\nRob came.", 2]);
});

test("no matches returns the original string identity", () => {
  const h = "<p>Nothing here</p>";
  assert.equal(replaceInHtml(h, re("zzz"), "q").html, h);
});

// ── project level ─────────────────────────────────────────────
const sc = (id: string, order: number, title: string, content: string, summary = "") => ({
  id, title, summary, content, chapter_id: "c1", order, plotline_id: "pl", character_ids: [], place_ids: [], tags: [],
});
const mk = (): Project => ({
  schema_version: 3, id: "p", title: "T", premise: "", genre: "", theme: "",
  chapters: [{ id: "c1", title: "One", summary: "" }],
  scenes: [
    sc("a", 0, "Bob arrives", "<p>Bob walked. Bob sat.</p>", "Bob is introduced"),
    sc("b", 1, "Quiet", "<p>Nothing.</p>"),
    sc("c", 2, "Later", "<p>Then Bob left.</p>"),
  ],
  snapshots: [], characters: [], places: [], notes: [], plotlines: [],
} as unknown as Project);
const O = { matchCase: false, wholeWord: true };

test("plan: counts per scene by field, previews, reading order, single-scene filter", () => {
  const p = planReplace(mk(), "bob", "Rob", O, { content: true, title: true, summary: true });
  assert.deepEqual(p.changes.map((c) => [c.sceneId, c.counts.content, c.counts.title, c.counts.summary]), [["a", 2, 1, 1], ["c", 1, 0, 0]]);
  assert.equal(p.total, 5);
  assert.equal(p.scenes, 2);
  assert.deepEqual(p.changes[0].snippet && [p.changes[0].snippet.match, p.changes[0].snippet.replacement], ["Bob", "Rob"]);
  const only = planReplace(mk(), "bob", "Rob", O, { content: true, title: false, summary: false }, "c");
  assert.deepEqual(only.changes.map((c) => c.sceneId), ["c"]);
  assert.equal(planReplace(mk(), "", "x", O, { content: true, title: false, summary: false }).total, 0);
});

test("apply: only chosen scenes and fields change; a safety snapshot holds the old state; input not mutated", () => {
  const before = mk();
  let n = 0;
  const r = applyReplace(before, "bob", "Rob", O, { content: true, title: false, summary: false }, new Set(["a"]), 123, () => `snap${++n}`);
  assert.equal(r.scenes, 1);
  assert.equal(r.replacements, 2);
  const [a, , c] = r.project.scenes;
  assert.equal(a.content, "<p>Rob walked. Rob sat.</p>");
  assert.equal(a.title, "Bob arrives");
  assert.equal(c.content, "<p>Then Bob left.</p>");
  assert.equal(r.project.snapshots.length, 1);
  const snap = r.project.snapshots[0];
  assert.deepEqual([snap.kind, snap.scene_id, snap.created_at, snap.content], ["safety", "a", 123, "<p>Bob walked. Bob sat.</p>"]);
  assert.match(snap.label, /bob.*Rob/);
  assert.equal(before.scenes[0].content, "<p>Bob walked. Bob sat.</p>");
  assert.equal(before.snapshots.length, 0);
});

test("apply with nothing to do returns the same project object", () => {
  const p = mk();
  assert.equal(applyReplace(p, "zzz", "q", O, { content: true, title: true, summary: true }, new Set(["a", "b", "c"]), 1, () => "x").project, p);
  assert.equal(applyReplace(p, "bob", "q", O, { content: true, title: true, summary: true }, new Set(), 1, () => "x").project, p);
});
