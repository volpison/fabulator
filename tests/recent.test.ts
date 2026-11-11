import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRecents, addRecent, removeRecent, recentLabels, MAX_RECENT } from "../src/lib/recent.ts";
import { toLocation } from "../src/lib/platform/types.ts";

const L = toLocation;

test("cleanRecents repairs stored junk and never throws", () => {
  assert.deepEqual(cleanRecents(undefined), []);
  assert.deepEqual(cleanRecents("x"), []);
  const out = cleanRecents([
    { location: "a", name: "A", at: 1 },
    { location: "a", name: "dup", at: 9 },
    { location: "", name: "no location", at: 5 },
    { location: "b" },
    null, 7,
  ]);
  assert.deepEqual(out.map((r) => [r.location, r.name]), [["a", "A"], ["b", "b"]]); // newest first; a missing name falls back to the location
});

test("adding moves a file to the top, replaces its old entry, and the list is capped", () => {
  let l = addRecent([], L("a"), "a.json", 1);
  l = addRecent(l, L("b"), "b.json", 2);
  l = addRecent(l, L("a"), "a.json", 3);
  assert.deepEqual(l.map((r) => r.location), ["a", "b"]);
  for (let i = 0; i < 25; i++) l = addRecent(l, L(`f${i}`), `f${i}.json`, 10 + i);
  assert.equal(l.length, MAX_RECENT);
  assert.equal(l[0].location, "f24");
});

test("removing and labelling (same names get their longer description)", () => {
  const l = [
    { location: L("/x/story.json"), name: "story.json", at: 3 },
    { location: L("/y/story.json"), name: "story.json", at: 2 },
    { location: L("/y/other.json"), name: "other.json", at: 1 },
  ];
  assert.deepEqual(recentLabels(l, (loc) => loc), ["story.json  (/x/story.json)", "story.json  (/y/story.json)", "other.json"]);
  assert.deepEqual(removeRecent(l, L("/x/story.json")).map((r) => r.location), ["/y/story.json", "/y/other.json"]);
});
