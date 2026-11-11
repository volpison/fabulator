import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../src/lib/blank.ts";
import { diffProject, applyPatch, LIST_FIELDS } from "../src/lib/patch.ts";
import { createUnsavedSync, FULL_RESYNC_EVERY } from "../src/lib/mirror.ts";
import { toLocation } from "../src/lib/platform/index.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
function base(): Project {
  const p = blankProject(newId);
  for (let i = 0; i < 4; i++) p.scenes.push({ ...p.scenes[0], id: newId("sc"), title: `S${i}`, order: i + 1 });
  return p;
}

function roundTrip(prev: Project, next: Project) {
  const d = diffProject(prev, next);
  if (d.kind === "none") assert.deepEqual(prev, next);
  else if (d.kind === "patch") assert.deepEqual(applyPatch(prev, d.patch), next);
  return d;
}

test("no change gives no patch", () => {
  const p = base();
  assert.equal(diffProject(p, clone(p)).kind, "none");
});

test("one edited scene sends only that scene", () => {
  const prev = base();
  const next = clone(prev);
  next.scenes[2].content = "<p>Once upon a time</p>";
  const d = roundTrip(prev, next);
  assert.equal(d.kind, "patch");
  if (d.kind !== "patch") return;
  assert.equal(d.patch.lists?.scenes?.upsert?.length, 1);
  assert.equal(d.patch.lists?.scenes?.order, undefined);
  assert.equal(d.patch.lists?.scenes?.remove, undefined);
  assert.deepEqual(Object.keys(d.patch.lists ?? {}), ["scenes"]);
  assert.ok(JSON.stringify(d.patch).length < JSON.stringify(next).length / 2);
});

test("plain fields, additions, deletions and reordering all round-trip", () => {
  const prev = base();
  const next = clone(prev);
  next.title = "Renamed";
  next.scenes.splice(1, 1); // delete
  next.scenes.reverse(); // reorder
  next.scenes.push({ ...next.scenes[0], id: newId("sc"), title: "New" }); // add
  next.characters.push({ id: newId("ch"), name: "Wolf" } as never);
  const d = roundTrip(prev, next);
  assert.equal(d.kind, "patch");
});

test("every list field can be patched", () => {
  for (const f of LIST_FIELDS) {
    const prev = base();
    const next = clone(prev);
    (next[f] as { id: string }[]).push({ id: newId("x") } as never);
    assert.equal(roundTrip(prev, next).kind, "patch", f);
  }
});

test("duplicate ids or a vanished plain field fall back to the whole project", () => {
  const prev = base();
  const dup = clone(prev);
  dup.scenes.push({ ...dup.scenes[0] });
  assert.equal(diffProject(prev, dup).kind, "full");
  const lost = clone(prev) as Record<string, unknown>;
  delete lost.genre;
  assert.equal(diffProject(prev, lost as unknown as Project).kind, "full");
});

test("random edit sequences always reproduce the exact project", () => {
  let seed = 7;
  const rnd = (k: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % k);
  let cur = base();
  for (let step = 0; step < 300; step++) {
    const next = clone(cur);
    switch (rnd(6)) {
      case 0: next.scenes[rnd(next.scenes.length)].title = `t${step}`; break;
      case 1: next.scenes.push({ ...next.scenes[0], id: newId("sc"), title: `n${step}` }); break;
      case 2: if (next.scenes.length > 1) next.scenes.splice(rnd(next.scenes.length), 1); break;
      case 3: next.scenes.sort(() => rnd(3) - 1); break;
      case 4: next.title = `p${step}`; break;
      case 5: next.notes.push({ id: newId("no"), title: "n", body: "" } as never); break;
    }
    roundTrip(cur, next);
    cur = next;
  }
});

// ── the sender ──

function sink() {
  const s = {
    full: 0, patches: 0, revision: 0, copy: null as Project | null, discards: 0,
    async keep(p: Project) { s.full++; s.copy = clone(p); return ++s.revision; },
    async keepChanges(b: number, patch: never) {
      if (!s.copy || b !== s.revision) return null;
      s.patches++; s.copy = applyPatch(s.copy, patch); return ++s.revision;
    },
    async discard() { s.discards++; s.copy = null; },
  };
  return s;
}
const loc = toLocation("C:\\s.fabulator.json");

test("first send is whole, later sends are patches, and the copy stays exact", async () => {
  const s = sink();
  const sync = createUnsavedSync(s);
  let cur = base();
  await sync.keep(cur, null);
  for (let i = 0; i < 5; i++) {
    cur = clone(cur);
    cur.scenes[0].content = `<p>${i}</p>`;
    await sync.keep(cur, null);
    assert.deepEqual(s.copy, cur);
  }
  assert.equal(s.full, 1);
  assert.equal(s.patches, 5);
});

test("an unchanged project sends nothing; a changed path alone is still sent", async () => {
  const s = sink();
  const sync = createUnsavedSync(s);
  const p = base();
  await sync.keep(p, null);
  await sync.keep(clone(p), null);
  assert.equal(s.full + s.patches, 1);
  await sync.keep(clone(p), loc);
  assert.equal(s.patches, 1);
});

test("if the platform lost its copy, the whole project is sent again", async () => {
  const s = sink();
  const sync = createUnsavedSync(s);
  let cur = base();
  await sync.keep(cur, null);
  s.copy = null; // e.g. the app restarted
  cur = clone(cur); cur.title = "x";
  await sync.keep(cur, null);
  assert.equal(s.full, 2);
  assert.deepEqual(s.copy, cur);
});

test("after a discard the next send is whole; a failure also resets", async () => {
  const s = sink();
  const sync = createUnsavedSync(s);
  let cur = base();
  await sync.keep(cur, null);
  await sync.discard(false);
  cur = clone(cur); cur.title = "y";
  await sync.keep(cur, null);
  assert.equal(s.full, 2);

  s.keepChanges = async () => { throw new Error("boom"); };
  cur = clone(cur); cur.title = "z";
  await assert.rejects(sync.keep(cur, null));
  s.keepChanges = sink().keepChanges;
  await sync.keep(cur, null);
  assert.equal(s.full, 3);
});

test("a full copy is re-sent every so often", async () => {
  const s = sink();
  const sync = createUnsavedSync(s);
  let cur = base();
  for (let i = 0; i <= FULL_RESYNC_EVERY + 1; i++) {
    cur = clone(cur); cur.title = `v${i}`;
    await sync.keep(cur, null);
  }
  assert.equal(s.full, 2);
});
