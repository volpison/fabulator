import { test } from "node:test";
import assert from "node:assert/strict";
import { findAtQuery, buildOptions, tidyNewName, MAX_MATCHES } from "../src/lib/atMention.ts";
import type { Entity } from "../src/lib/mentions.ts";

const E = (type: "character" | "place", id: string, name: string, ...aliases: string[]): Entity => ({
  type, id, name, terms: [name, ...aliases],
});
const ents = [
  E("character", "c1", "Ana Autora", "Annie"),
  E("character", "c2", "João"),
  E("character", "c3", "The Shepherd Boy", "Boy"),
  E("place", "p1", "Annapolis"),
  E("place", "p2", "Village"),
];

test("the picker opens on a word-initial @ only", () => {
  assert.deepEqual(findAtQuery("Hello @ana"), { query: "ana", start: 6 });
  assert.deepEqual(findAtQuery("@"), { query: "", start: 0 });
  assert.deepEqual(findAtQuery("“@Jo"), { query: "Jo", start: 1 });
  assert.equal(findAtQuery("write to ana@site.com"), null); // e-mail
  assert.equal(findAtQuery("no at sign"), null);
});

test("it follows up to three words, then lets go", () => {
  assert.equal(findAtQuery("@the shepherd boy")?.query, "the shepherd boy");
  assert.equal(findAtQuery("@one two three four"), null);
  assert.equal(findAtQuery("@Ana. Then he left"), null);
  assert.deepEqual(findAtQuery("@a @b"), { query: "b", start: 3 });
  assert.equal(findAtQuery("@" + "x".repeat(60)), null);
});

test("matching ignores case and accents; name starts beat aliases beat the middle", () => {
  assert.equal(buildOptions("joao", ents)[0].kind, "existing");
  assert.equal((buildOptions("JOAO", ents)[0] as any).id, "c2");
  const ann = buildOptions("ann", ents).filter((o) => o.kind === "existing") as any[];
  assert.deepEqual(ann.map((o) => o.id), ["p1", "c1"]); // Annapolis (a name) beats Ana Autora (via alias "Annie")
  assert.equal(ann[0].via, null);
  assert.equal(ann[1].via, "Annie");
  assert.equal((buildOptions("boy", ents)[0] as any).id, "c3");
  assert.equal((buildOptions("shep", ents)[0] as any).id, "c3"); // word start inside a name
});

test("an empty query lists some entities and offers no creation", () => {
  const o = buildOptions("", ents);
  assert.equal(o.length, ents.length);
  assert.ok(o.every((x) => x.kind === "existing"));
  assert.ok(buildOptions("", Array.from({ length: 20 }, (_, i) => E("character", "x" + i, "Name" + i))).length === MAX_MATCHES);
});

test("a new name offers 'new character' / 'new place', unless it already exists", () => {
  const o = buildOptions("Zelda", ents);
  assert.deepEqual(o.map((x) => x.kind + ":" + x.type), ["new:character", "new:place"]);
  assert.ok(!buildOptions("João", ents).some((x) => x.kind === "new")); // exact match
  assert.ok(!buildOptions("boy", ents).some((x) => x.kind === "new")); // exact alias
  assert.ok(!buildOptions("Z", ents).some((x) => x.kind === "new")); // too short
  assert.ok(!buildOptions("Zelda ", ents).some((x) => x.kind === "new")); // still typing
});

test("new names are tidied", () => {
  assert.equal(tidyNewName("  little   red "), "Little red");
  assert.equal(tidyNewName(""), "");
});
