import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanTodos, addTodoTo, toggleTodoIn, editTodoIn, removeTodoFrom, clearDone, todoCounts, summaryLine,
  todosToLines, linesToTodos, MAX_TODO_LENGTH,
} from "../src/lib/scenenotes.ts";
import { migrateProject, CURRENT_SCHEMA_VERSION } from "../src/lib/migrate.ts";
import { toFolder, fromFolder } from "../src/lib/folder.ts";
import { blankProject } from "../src/lib/blank.ts";

const td = (id: string, text: string, done = false) => ({ id, text, done });

test("cleanTodos repairs anything it is given and never throws", () => {
  assert.deepEqual(cleanTodos(undefined), []);
  assert.deepEqual(cleanTodos("x"), []);
  const out = cleanTodos([
    { id: "a", text: "  Fix   the dates ", done: true },
    { id: "a", text: "duplicate id" },
    { text: "no id", done: "yes" },
    { id: "z", text: "   " },
    null, 5,
  ]);
  assert.deepEqual(out.map((t) => [t.text, t.done]), [["Fix the dates", true], ["duplicate id", false], ["no id", false]]);
  assert.equal(new Set(out.map((t) => t.id)).size, 3);
  assert.equal(cleanTodos([{ id: "l", text: "x".repeat(1000) }])[0].text.length, MAX_TODO_LENGTH);
});

test("add, toggle, edit, remove, clear done", () => {
  let l = addTodoTo([], "1", "  First ");
  assert.deepEqual(l, [td("1", "First")]);
  assert.equal(addTodoTo(l, "2", "   "), l); // blank ignored: same list
  l = addTodoTo(l, "2", "Second");
  l = toggleTodoIn(l, "1");
  assert.deepEqual(todoCounts(l), { open: 1, done: 1, total: 2 });
  l = editTodoIn(l, "2", "Second, edited");
  assert.equal(l[1].text, "Second, edited");
  assert.equal(editTodoIn(l, "zzz", "x").length, 2);
  assert.deepEqual(clearDone(l).map((t) => t.id), ["2"]);
  assert.deepEqual(editTodoIn(l, "2", "  ").map((t) => t.id), ["1"]); // emptied = removed
  assert.deepEqual(removeTodoFrom(l, "1").map((t) => t.id), ["2"]);
  const same = [td("a", "x")];
  assert.equal(clearDone(same), same);
});

test("summary line for the collapsed bar", () => {
  assert.equal(summaryLine("", []), "");
  assert.equal(summaryLine("some note", []), "notes");
  assert.equal(summaryLine("n", [td("1", "a"), td("2", "b", true)]), "notes · 1 open to-do");
  assert.equal(summaryLine("", [td("1", "a"), td("2", "b")]), "2 open to-dos");
  assert.equal(summaryLine("", [td("1", "a", true)]), "all to-dos done");
});

test("folder lines round-trip, including hand-written ones", () => {
  const l = [td("1", "Open one"), td("2", "Done one", true)];
  assert.deepEqual(todosToLines(l), ["[ ] Open one", "[x] Done one"]);
  assert.deepEqual(linesToTodos(todosToLines(l)).map((t) => [t.text, t.done]), [["Open one", false], ["Done one", true]]);
  assert.deepEqual(linesToTodos(["plain line", "[X] shouty"]).map((t) => [t.text, t.done]), [["plain line", false], ["shouty", true]]);
});

test("a v4 project upgrades: every scene gets empty notes and to-dos", () => {
  const old = blankProject((p) => p + "-1") as any;
  old.schema_version = 4;
  for (const s of old.scenes) { delete s.notes; delete s.todos; }
  const r = migrateProject(old);
  assert.equal(r.migratedFrom, 4);
  assert.equal(r.project.schema_version, CURRENT_SCHEMA_VERSION);
  assert.equal(r.project.scenes[0].notes, "");
  assert.deepEqual(r.project.scenes[0].todos, []);
});

test("notes and to-dos survive the Markdown folder, multi-line notes included", () => {
  const p = blankProject((x) => x + "-1");
  p.scenes[0].notes = "Check the timeline.\n\nAna: she can't know yet — see ch. 3";
  p.scenes[0].todos = [td("a", "Fix the river", false), td("b", "Add: a clue, \"maybe\"", true)];
  const back = fromFolder(toFolder(p), (x) => x + "-n");
  assert.ok(back.ok);
  if (!back.ok) return;
  assert.equal(back.project.scenes[0].notes, p.scenes[0].notes);
  assert.deepEqual(back.project.scenes[0].todos.map((t) => [t.text, t.done]), [["Fix the river", false], ["Add: a clue, \"maybe\"", true]]);
});
