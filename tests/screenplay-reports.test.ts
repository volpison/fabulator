import { test } from "node:test";
import assert from "node:assert/strict";
import { blankScreenplay } from "../src/lib/blank.ts";
import { addScene, updateScene, addElement, updateElement } from "../src/lib/screenplayedit.ts";
import { sceneReport, characterReport, locationReport, reportCsv } from "../src/lib/screenplayreports.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const newId = (p = "x") => `${p}-${++n}`;
const ch = (id: string, name: string) => ({ id, name, aliases: [], traits: [], role: "", category: "", description: "", notes: "" });

function sample(): Project {
  let p = blankScreenplay(newId);
  p = { ...p, characters: [ch("c1", "Maria"), ch("c2", "Joe"), ch("c3", "Extra")] as any };
  const s1 = p.script_scenes[0].id;
  p = updateScene(p, s1, { int_ext: "INT", location: "Kitchen", time: "Day", character_ids: ["c3"] });
  const add = (s: string, kind: any, text: string, x: any = {}) => {
    const r = addElement(p, newId, s, kind);
    p = updateElement(r.project, s, r.id, { text, ...x });
  };
  add(s1, "action", "She cooks.");
  add(s1, "dialogue", "Hello there you", { speaker_id: "c1" });
  add(s1, "dialogue", "Hi", { speaker_id: "c2" });
  add(s1, "dialogue", "Again, hello", { speaker_id: "c1" });
  const r2 = addScene(p, newId, p.acts[0].id);
  p = updateScene(r2.project, r2.id, { int_ext: "EXT", location: "kitchen", time: "Night" });
  add(r2.id, "dialogue", "Bye", { speaker_id: "c1" });
  const r3 = addScene(p, newId, p.acts[0].id);
  p = updateScene(r3.project, r3.id, { int_ext: "EXT", location: "Bridge", time: "Dawn" });
  return p;
}

test("scene report: numbers, slug, speakers (once each), words", () => {
  const rows = sceneReport(sample());
  assert.deepEqual(rows.map((r) => r.number), [1, 2, 3]);
  assert.equal(rows[0].slug, "INT. KITCHEN - DAY");
  assert.deepEqual(rows[0].speakers, ["Maria", "Joe"]);
  assert.equal(rows[0].words, 2 + 3 + 1 + 2);
  assert.equal(rows[0].act, "Act 1");
  assert.equal(rows[2].speakers.length, 0);
});

test("character report: lines, words, scenes; cast-list-only characters come last", () => {
  const rows = characterReport(sample());
  assert.deepEqual(rows.map((r) => r.name), ["Maria", "Joe", "Extra"]);
  assert.deepEqual([rows[0].lines, rows[0].words, rows[0].speaking, rows[0].scenes], [3, 6, 2, [1, 2]]);
  assert.deepEqual([rows[2].lines, rows[2].speaking, rows[2].scenes], [0, 0, [1]]);
});

test("location report: grouped regardless of case, with both INT/EXT and times", () => {
  const rows = locationReport(sample());
  const k = rows.find((r) => r.location === "KITCHEN")!;
  assert.deepEqual(k.scenes, [1, 2]);
  assert.deepEqual(k.int_ext, ["INT", "EXT"]);
  assert.deepEqual(k.times, ["DAY", "NIGHT"]);
  assert.equal(rows.length, 2);
});

test("csv: header, quoting, CRLF", () => {
  const p = sample();
  const c = reportCsv(p, "scenes");
  assert.ok(c.startsWith("Scene,Act,Slug line,Pages,Words,Speaking characters,Status\r\n"));
  assert.ok(c.includes('"Maria; Joe"') === false); // no commas, so no quotes needed
  assert.ok(c.includes("Maria; Joe"));
  assert.match(reportCsv(p, "characters"), /\r\nMaria,2,2,3,6,1 2\r\n/);
  const q = updateScene(p, p.script_scenes[2].id, { location: 'A, "B"' });
  assert.ok(reportCsv(q, "locations").includes('"A, ""B"""'));
});
