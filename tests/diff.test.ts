import { test } from "node:test";
import assert from "node:assert/strict";
import { diffText, countWords } from "../src/lib/diff.ts";

const render = (r: ReturnType<typeof diffText>) =>
  r.segments.map((s) => (s.type === "equal" ? s.text : s.type === "add" ? `[+${s.text}]` : `[-${s.text}]`)).join("");

test("identical texts: one equal segment, not changed", () => {
  const r = diffText("Hello world.\nSecond.", "Hello world.\nSecond.");
  assert.equal(r.changed, false);
  assert.deepEqual([r.added, r.removed], [0, 0]);
  assert.equal(r.segments.length, 1);
});

test("a changed word is shown word-by-word inside the paragraph", () => {
  const r = diffText("The wolf was gone.", "The fox was gone.");
  assert.equal(render(r), "The [-wolf][+fox] was gone.\n");
  assert.deepEqual([r.added, r.removed], [1, 1]);
});

test("added and removed whole paragraphs", () => {
  const r = diffText("One.\nTwo.\nThree.", "One.\nThree.\nFour.");
  assert.equal(render(r), "One.\n[-Two.\n]Three.\n[+Four.\n]");
  assert.deepEqual([r.added, r.removed], [1, 1]);
});

test("insertion inside a sentence", () => {
  const r = diffText("He ran home.", "He ran all the way home.");
  assert.equal(render(r), "He ran [+all the way ]home.\n");
  assert.equal(r.added, 3);
  assert.equal(r.removed, 0);
});

test("punctuation and accents are tokens of their own", () => {
  const r = diffText("Olá, José!", "Olá, José?");
  assert.equal(render(r), "Olá, José[-!][+?]\n");
});

test("completely different text: everything removed and added, counts right", () => {
  const r = diffText("alpha beta gamma", "one two three four");
  assert.deepEqual([r.added, r.removed], [4, 3]);
  assert.equal(r.changed, true);
});

test("empty old text / empty new text", () => {
  const a = diffText("", "New words here");
  assert.equal(a.added, 3);
  const b = diffText("Old words here", "");
  assert.equal(b.removed, 3);
});

test("applying the diff reproduces both sides (round trip)", () => {
  const oldT = "The boy sat.\nHe was bored, very bored.\nThe sheep grazed.";
  const newT = "The boy sat down.\nHe was bored.\nA wolf appeared.\nThe sheep grazed.";
  const r = diffText(oldT, newT);
  const rebuiltOld = r.segments.filter((s) => s.type !== "add").map((s) => s.text).join("");
  const rebuiltNew = r.segments.filter((s) => s.type !== "del").map((s) => s.text).join("");
  assert.equal(rebuiltOld.replace(/\n$/, ""), oldT);
  assert.equal(rebuiltNew.replace(/\n$/, ""), newT);
});

test("huge changed block falls back to a coarse diff instead of blowing up", () => {
  const a = Array.from({ length: 300 }, (_, i) => `a${i}`).join(" ");
  const b = Array.from({ length: 300 }, (_, i) => `b${i}`).join(" ");
  const r = diffText(a, b, 1000); // tiny table limit forces the fallback
  assert.equal(r.segments.some((s) => s.type === "del"), true);
  assert.equal(r.segments.some((s) => s.type === "add"), true);
  assert.deepEqual([r.added, r.removed], [300, 300]);
});

test("large similar texts stay fast", () => {
  const para = (i: number) => `Paragraph ${i}: ` + "the quick brown fox jumps over the lazy dog ".repeat(12);
  const old = Array.from({ length: 200 }, (_, i) => para(i)).join("\n");
  const neu = Array.from({ length: 200 }, (_, i) => (i % 20 === 0 ? para(i).replace("fox", "wolf") : para(i))).join("\n");
  const t0 = Date.now();
  const r = diffText(old, neu);
  assert.ok(Date.now() - t0 < 2000);
  // 10 paragraphs changed, one word each (replace() swaps only the first "fox")
  assert.deepEqual([r.added, r.removed], [10, 10]);
});

test("countWords is Unicode-aware", () => {
  assert.equal(countWords("José foi à praça, não é?"), 6);
  assert.equal(countWords(""), 0);
});
