import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_STATE, localDateKey, cleanGoal, sanitizeGoalState, trackDay, goalProgress, restartToday, withGoals, MAX_GOAL,
} from "../src/lib/goals.ts";

test("local date key uses the local calendar day, zero padded", () => {
  assert.equal(localDateKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(localDateKey(new Date(2026, 10, 8, 0, 0)), "2026-11-08");
});

test("goal input: numbers, strings with separators, junk, limits", () => {
  assert.equal(cleanGoal(500), 500);
  assert.equal(cleanGoal("1,000"), 1000);
  assert.equal(cleanGoal(" 80 000 "), 80000);
  assert.equal(cleanGoal("12.6"), 13);
  for (const bad of ["", "abc", null, undefined, NaN, Infinity, {}, -5, "-3"]) assert.equal(cleanGoal(bad), 0, String(bad));
  assert.equal(cleanGoal(1e12), MAX_GOAL);
});

test("sanitize: defaults, damaged data", () => {
  assert.deepEqual(sanitizeGoalState(undefined), EMPTY_STATE);
  assert.deepEqual(sanitizeGoalState("x"), EMPTY_STATE);
  assert.deepEqual(sanitizeGoalState({ goals: { daily: "300", total: -1 }, day: { date: "nope", baseline: 5 } }), { goals: { daily: 300, total: 0 }, day: null });
  assert.deepEqual(sanitizeGoalState({ goals: { daily: 300, total: 90000 }, day: { date: "2026-11-08", baseline: 1200 } }), { goals: { daily: 300, total: 90000 }, day: { date: "2026-11-08", baseline: 1200 } });
  assert.equal(sanitizeGoalState({ day: { date: "2026-11-08", baseline: -4 } }).day, null);
});

test("first sight of a day starts from the current total; later edits count from there", () => {
  let s = trackDay(EMPTY_STATE, 1000, "2026-11-08");
  assert.deepEqual(s.day, { date: "2026-11-08", baseline: 1000 });
  assert.equal(goalProgress(s, 1000).writtenToday, 0);
  s = trackDay(s, 1420, "2026-11-08");
  assert.equal(goalProgress(s, 1420).writtenToday, 420);
  assert.equal(trackDay(s, 1420, "2026-11-08"), s); // unchanged -> same object
});

test("a new day starts over from the current total", () => {
  let s = trackDay(EMPTY_STATE, 1000, "2026-11-08");
  s = trackDay(s, 1500, "2026-11-08");
  s = trackDay(s, 1500, "2026-11-09");
  assert.deepEqual(s.day, { date: "2026-11-09", baseline: 1500 });
  assert.equal(goalProgress(s, 1500).writtenToday, 0);
});

test("cutting below the start lowers it, so new words count immediately", () => {
  let s = trackDay(EMPTY_STATE, 1000, "d");
  s = trackDay(s, 1300, "d"); // +300
  s = trackDay(s, 700, "d"); // big cut: start follows down
  assert.equal(s.day!.baseline, 700);
  assert.equal(goalProgress(s, 700).writtenToday, 0);
  s = trackDay(s, 760, "d");
  assert.equal(goalProgress(s, 760).writtenToday, 60);
});

test("progress against goals: daily and manuscript, capped bars, remaining, done", () => {
  let s = withGoals(EMPTY_STATE, { daily: 1000, total: 80000 });
  s = trackDay(s, 10000, "d");
  let p = goalProgress(s, 10400);
  assert.equal(p.writtenToday, 400);
  assert.deepEqual([p.daily!.goal, p.daily!.ratio, p.daily!.percent, p.daily!.remaining, p.daily!.done], [1000, 0.4, 40, 600, false]);
  assert.deepEqual([p.manuscript!.value, p.manuscript!.percent, p.manuscript!.remaining], [10400, 13, 69600]);
  p = goalProgress(s, 11500);
  assert.deepEqual([p.daily!.ratio, p.daily!.percent, p.daily!.remaining, p.daily!.done], [1, 150, 0, true]);
  assert.equal(goalProgress(s, 10000).daily!.done, false);
});

test("no goals -> no progress bars, but today's count still works", () => {
  const s = trackDay(EMPTY_STATE, 50, "d");
  const p = goalProgress(s, 80);
  assert.deepEqual([p.writtenToday, p.daily, p.manuscript], [30, null, null]);
});

test("restart today's count, and editing goals keeps the day record", () => {
  let s = trackDay(EMPTY_STATE, 100, "d");
  s = restartToday(s, 400, "d");
  assert.equal(goalProgress(s, 450).writtenToday, 50);
  const g = withGoals(s, { daily: "250" as unknown as number });
  assert.equal(g.goals.daily, 250);
  assert.deepEqual(g.day, s.day);
  assert.equal(withGoals(g, { total: 0 }).goals.daily, 250); // untouched field kept
});
