import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWhen, formatGap, chronology } from "../src/lib/storytime.ts";

const m = (t: string) => parseWhen(t)?.minutes;
const kind = (t: string) => parseWhen(t)?.kind;

test("dates: ISO, day-first, with times and time words", () => {
  assert.equal(kind("2026-11-10"), "date");
  assert.equal(m("2026-11-10 14:30")! - m("2026-11-10")!, 14 * 60 + 30);
  assert.equal(m("10/11/2026"), m("2026-11-10"));
  assert.equal(m("2026-11-10 evening")! - m("2026-11-10")!, 19 * 60);
  assert.equal(m("1342-05-02") !== undefined, true);
  assert.ok(m("1342-05-02")! < m("1342-05-03")!);
  assert.ok(m("0050-01-01")! < m("0051-01-01")!); // years below 100 stay themselves
});

test("impossible dates and times are not understood", () => {
  for (const t of ["2026-02-31", "2026-13-01", "31/02/2026", "2026-11-10 25:00", "2026-11-10 whenever"]) {
    assert.equal(parseWhen(t), null, t);
  }
});

test("days: Day N with optional time, English and Portuguese, case-insensitive", () => {
  assert.equal(kind("Day 3"), "day");
  assert.equal(m("day 3"), m("D3"));
  assert.equal(m("Dia 3"), m("Day 3"));
  assert.equal(m("Day 3 evening")! - m("Day 3")!, 19 * 60);
  assert.equal(m("Day 3, 14:30")! - m("Day 3")!, 14 * 60 + 30);
  assert.equal(m("Dia 3 manhã")! - m("Day 3")!, 9 * 60);
  assert.equal(m("Day 3 2pm")! - m("Day 3")!, 14 * 60);
  assert.ok(m("Day 2 night")! < m("Day 3 dawn")!);
  assert.ok(m("Day 9")! < m("Day 10")!); // numeric, not alphabetical
});

test("free-form labels and empty text are not placed", () => {
  for (const t of ["", "  ", "Long ago", "the winter after", "Day", "Day x"]) assert.equal(parseWhen(t), null, t);
});

test("gap wording", () => {
  assert.equal(formatGap(10, 10), "same moment");
  assert.equal(formatGap(0, 45), "+45 min");
  assert.equal(formatGap(0, 180), "+3 h");
  assert.equal(formatGap(0, 1440), "+1 day");
  assert.equal(formatGap(0, 3 * 1440), "+3 days");
  assert.equal(formatGap(0, 90 * 1440), "+3 months");
  assert.equal(formatGap(5 * 1440, 0), "+5 days"); // distance, not direction
  assert.match(formatGap(0, 365 * 5 * 1440), /years/);
});

const sc = (id: string, ch: string, order: number, when: string) => ({ id, title: id, chapter_id: ch, order, when }) as any;
const proj = (scenes: any[]) => ({ chapters: [{ id: "c1", title: "1", summary: "" }, { id: "c2", title: "2", summary: "" }], scenes }) as any;

test("chronology sorts by story time, keeps book position, flags flashbacks", () => {
  const c = chronology(proj([
    sc("a", "c1", 0, "Day 5"),
    sc("b", "c1", 1, "Day 1"), // a flashback in book order
    sc("c", "c2", 0, "Day 6"),
    sc("d", "c2", 1, ""),
  ]));
  assert.equal(c.kind, "day");
  assert.deepEqual(c.rows.map((r) => r.scene.id), ["b", "a", "c"]);
  assert.deepEqual(c.rows.map((r) => r.position), [2, 1, 3]);
  assert.deepEqual(c.rows.map((r) => r.backward), [true, false, false]);
  assert.deepEqual(c.rows.map((r) => r.gap), [null, "+4 days", "+1 day"]);
  assert.deepEqual(c.unplaced.map((u) => [u.scene.id, u.reason]), [["d", "empty"]]);
});

test("equal times keep book order; mixed styles use the majority and set the rest aside", () => {
  const c = chronology(proj([
    sc("a", "c1", 0, "2026-01-01"),
    sc("b", "c1", 1, "2026-01-01"),
    sc("c", "c2", 0, "Day 2"),
    sc("d", "c2", 1, "someday"),
  ]));
  assert.equal(c.kind, "date");
  assert.deepEqual(c.rows.map((r) => r.scene.id), ["a", "b"]);
  assert.equal(c.rows[1].gap, "same moment");
  assert.deepEqual(c.unplaced.map((u) => [u.scene.id, u.reason]), [["c", "other-style"], ["d", "unreadable"]]);
});

test("a project with no times has an empty chronology", () => {
  const c = chronology(proj([sc("a", "c1", 0, ""), sc("b", "c1", 1, "")]));
  assert.equal(c.kind, null);
  assert.equal(c.rows.length, 0);
  assert.equal(c.unplaced.length, 2);
});

import { migrateProject, CURRENT_SCHEMA_VERSION } from "../src/lib/migrate.ts";
import { toFolder, fromFolder } from "../src/lib/folder.ts";
import { blankProject } from "../src/lib/blank.ts";

test("a v5 project upgrades with an empty `when`; the text survives the Markdown folder", () => {
  const old = blankProject((p) => p + "-1") as any;
  old.schema_version = 5;
  delete old.scenes[0].when;
  const r = migrateProject(old);
  assert.equal(r.migratedFrom, 5);
  assert.equal(r.project.schema_version, CURRENT_SCHEMA_VERSION);
  assert.equal(r.project.scenes[0].when, "");

  const p = blankProject((x) => x + "-1");
  p.scenes[0].when = "Day 3, evening";
  const back = fromFolder(toFolder(p), (x) => x + "-n");
  assert.ok(back.ok);
  if (back.ok) assert.equal(back.project.scenes[0].when, "Day 3, evening");
});
