import { test } from "node:test";
import assert from "node:assert/strict";
import { countWordsInText, wordsOfHtml, sceneWords, wordStats, clearWordCache } from "../src/lib/wordcount.ts";
import type { Project } from "../src/lib/types.ts";

test("what counts as a word", () => {
  assert.equal(countWordsInText(""), 0);
  assert.equal(countWordsInText("   \n  "), 0);
  assert.equal(countWordsInText("The boy cried wolf."), 4);
  assert.equal(countWordsInText("don't can’t well-known"), 3); // apostrophes (straight/curly) and hyphens join
  assert.equal(countWordsInText("word—word"), 2); // em dash separates
  assert.equal(countWordsInText("— … ! ? ( ) *"), 0); // punctuation alone is not a word
  assert.equal(countWordsInText("1,000 apples, 3.14 pears, 7"), 5); // "1,000" and "3.14" are single numbers
  assert.equal(countWordsInText("Hello, world. 3, 4"), 4); // comma + space is not part of a number
  assert.equal(countWordsInText("José Çağlar 日本語 Привет"), 4);
  assert.equal(countWordsInText("rock 'n' roll"), 3);
});

test("html: tags are not words and paragraphs do not glue together", () => {
  assert.equal(wordsOfHtml("<p>Hello <strong>big</strong> world</p><p>Next</p>"), 4);
  assert.equal(wordsOfHtml("<p>end</p><p>start</p>"), 2);
  assert.equal(wordsOfHtml("<p>a<br>b</p>"), 2);
  assert.equal(wordsOfHtml("<p>Tom &amp; Jerry &nbsp; ok</p>"), 3);
  assert.equal(wordsOfHtml('<p class="three words">x</p>'), 1);
  assert.equal(wordsOfHtml(""), 0);
  assert.equal(wordsOfHtml("<p></p>"), 0);
  assert.equal(wordsOfHtml("Legacy plain\n\ntext here"), 4);
});

const sc = (id: string, ch: string, content: string) => ({
  id, title: "", summary: "", content, chapter_id: ch, order: 0, plotline_id: "p", character_ids: [], place_ids: [], tags: [],
});
const proj = (): Pick<Project, "scenes" | "chapters"> => ({
  chapters: [{ id: "c1", title: "A", summary: "" }, { id: "c2", title: "B", summary: "" }, { id: "c3", title: "Empty", summary: "" }],
  scenes: [sc("s1", "c1", "<p>one two three</p>"), sc("s2", "c1", "<p>four five</p>"), sc("s3", "c2", "<p>six</p>"), sc("s4", "c2", "")],
});

test("stats: per scene, per chapter (including empty chapters), total", () => {
  clearWordCache();
  const st = wordStats(proj());
  assert.equal(st.total, 6);
  assert.deepEqual([...st.byScene], [["s1", 3], ["s2", 2], ["s3", 1], ["s4", 0]]);
  assert.deepEqual([...st.byChapter], [["c1", 5], ["c2", 1], ["c3", 0]]);
});

test("cache follows edits and never returns stale counts", () => {
  clearWordCache();
  const s = sc("x", "c1", "<p>a b</p>");
  assert.equal(sceneWords(s), 2);
  assert.equal(sceneWords(s), 2);
  assert.equal(sceneWords({ ...s, content: "<p>a b c d</p>" }), 4);
  assert.equal(sceneWords({ ...s, content: "" }), 0);
});

test("stats of an empty project", () => {
  const st = wordStats({ chapters: [], scenes: [] });
  assert.deepEqual([st.total, st.byScene.size, st.byChapter.size], [0, 0, 0]);
});
