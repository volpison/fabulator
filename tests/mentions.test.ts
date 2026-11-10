import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entitiesOf,
  findMentionsInText,
  findUnlinkedMentions,
  htmlToPlainText,
  mentionRangesInBlock,
  type Entity,
} from "../src/lib/mentions.ts";

const ent = (id: string, name: string, aliases: string[] = [], type: "character" | "place" = "character"): Entity =>
  entitiesOf({
    characters: type === "character" ? [{ id, name, aliases } as never] : [],
    places: type === "place" ? [{ id, name, aliases } as never] : [],
  })[0];

const hits = (text: string, entities: Entity[]) =>
  findMentionsInText(text, entities).map((m) => [m.id, text.slice(m.start, m.end)]);

test("whole words only: no hits inside longer words", () => {
  const ana = ent("ana", "Ana");
  assert.deepEqual(hits("Ana saw Joana and the Anão.", [ana]), [["ana", "Ana"]]);
  assert.deepEqual(hits("Banana Ana-Maria", [ana]), [["ana", "Ana"]]); // hyphen is a boundary
});

test("accented names: boundaries respect Unicode letters", () => {
  const jose = ent("jose", "José");
  assert.deepEqual(hits("Disse José. Joséphine riu.", [jose]), [["jose", "José"]]);
  const ines = ent("ines", "Inês");
  assert.deepEqual(hits("— Inês, vem! Inêsa não.", [ines]), [["ines", "Inês"]]);
  // a name that ends in an unaccented letter must not match before an accented one
  const jo = ent("jo", "Jo");
  assert.deepEqual(hits("Joã e Jo", [jo]), [["jo", "Jo"]]);
});

test("accent- and case-insensitive in both directions, offsets point at the original", () => {
  const jose = ent("jose", "José");
  assert.deepEqual(hits("JOSE and josé", [jose]), [["jose", "JOSE"], ["jose", "josé"]]);
  const zoe = ent("zoe", "Zoe");
  const text = "Olá, Zoë!";
  const [m] = findMentionsInText(text, [zoe]);
  assert.equal(text.slice(m.start, m.end), "Zoë");
});

test("curly and straight apostrophes are equivalent; possessives match", () => {
  const dart = ent("d", "D'Artagnan");
  assert.equal(findMentionsInText("D’Artagnan rode on.", [dart]).length, 1);
  const ana = ent("ana", "Ana");
  assert.deepEqual(hits("Ana's hat; Ana’s coat", [ana]), [["ana", "Ana"], ["ana", "Ana"]]);
});

test("aliases count as mentions of the same entity", () => {
  const boy = ent("boy", "The Shepherd Boy", ["the boy", "Pip"]);
  assert.deepEqual(hits("Pip sat. The boy sighed.", [boy]), [["boy", "Pip"], ["boy", "The boy"]]);
});

test("longest name wins over a shorter alias on the same text", () => {
  const boy = ent("boy", "The Shepherd Boy", ["Boy"]);
  const other = ent("other", "Boy"); // another entity named just "Boy"
  const out = findMentionsInText("The Shepherd Boy waved. Boy!", [other, boy]);
  assert.deepEqual(out.map((m) => [m.id, m.start]), [["boy", 0], ["other", 24]]);
});

test("no overlapping matches", () => {
  const a = ent("a", "New York");
  const b = ent("b", "York Minster");
  const out = findMentionsInText("New York Minster", [a, b]);
  assert.equal(out.length, 1);
});

test("whitespace variants (nbsp, newline) still match multi-word names", () => {
  const boy = ent("boy", "The Shepherd Boy");
  assert.equal(findMentionsInText("The Shepherd\nBoy", [boy]).length, 1);
});

test("astral characters before a name keep offsets correct", () => {
  const ana = ent("ana", "Ana");
  const text = "😀 Ana";
  const [m] = findMentionsInText(text, [ana]);
  assert.equal(text.slice(m.start, m.end), "Ana");
  assert.equal(findMentionsInText("😀Ana", [ana]).length, 1); // emoji is not a letter
});

test("too-short and empty terms are ignored", () => {
  assert.deepEqual(entitiesOf({ characters: [{ id: "x", name: "A", aliases: ["", " "] } as never], places: [] }), []);
});

test("aliases that differ only by case/accents are de-duplicated per entity", () => {
  const e = ent("e", "Ana", ["ana", "ANA", "Ánã", "Aninha"]);
  assert.deepEqual(e.terms, ["Ana", "Aninha"]);
});

test("htmlToPlainText: inline tags don't split words, blocks become newlines", () => {
  assert.equal(htmlToPlainText("<p>Shep<strong>herd</strong> &amp; co</p><p>Next</p>"), "Shepherd & co\nNext");
  assert.equal(htmlToPlainText("a<br>b"), "a\nb");
  assert.equal(htmlToPlainText("It&#39;s &quot;x&quot; &#233;"), 'It\'s "x" é');
});

test("findUnlinkedMentions: skips linked entities, one suggestion per entity", () => {
  const project = {
    characters: [
      { id: "c1", name: "Ana", aliases: [] },
      { id: "c2", name: "Bruno", aliases: ["Bru"] },
    ],
    places: [{ id: "p1", name: "The Mill", aliases: ["mill"] }],
  } as never;
  const scene = { character_ids: ["c1"], place_ids: [] } as never;
  const out = findUnlinkedMentions(
    "<p>Ana met Bru at the mill. Bruno left the Mill.</p>",
    scene,
    project
  );
  assert.deepEqual(out.map((s: { id: string }) => s.id), ["c2", "p1"]);
});

// A fake ProseMirror text block: children are text runs (marks split them) or leaf nodes.
const block = (...kids: (string | null)[]) => ({
  forEach(cb: (c: { isText: boolean; text?: string }, offset: number) => void) {
    let offset = 0;
    for (const k of kids) {
      if (k === null) { cb({ isText: false }, offset); offset += 1; }
      else { cb({ isText: true, text: k }, offset); offset += k.length; }
    }
  },
});

test("mentionRangesInBlock: document positions, including names split across marks", () => {
  const boy = ent("boy", "Shepherd Boy");
  // block node at pos 10 => content starts at 11. Text runs: "The Shep" + "herd" (bold) + " Boy sat"
  const ranges = mentionRangesInBlock(block("The Shep", "herd", " Boy sat"), 10, [boy]);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].from, 11 + 4); // "Shepherd Boy" starts at text index 4
  assert.equal(ranges[0].to, 11 + 4 + "Shepherd Boy".length);
});

test("mentionRangesInBlock: a hard break occupies one position and shifts later matches", () => {
  const ana = ent("ana", "Ana");
  const ranges = mentionRangesInBlock(block("Hi", null, "Ana"), 0, [ana]);
  // content starts at 1: "Hi" = 1,2; break = 3; "Ana" = 4..6
  assert.deepEqual(ranges.map((r) => [r.from, r.to]), [[4, 7]]);
});

test("mentionRangesInBlock: several mentions and accented text", () => {
  const e = [ent("j", "José"), ent("p", "Praça", [], "place")];
  const ranges = mentionRangesInBlock(block("Jose foi à praca."), 0, e);
  assert.deepEqual(ranges.map((r) => [r.mention.id, r.from, r.to]), [["j", 1, 5], ["p", 12, 17]]);
});
