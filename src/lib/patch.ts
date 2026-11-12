/**
 * Small changes instead of the whole project.
 *
 * The web view still builds the project, but it no longer re-sends all of it after every
 * edit: it sends a *patch* (what changed since the last send). The Rust side applies the same
 * patch to the copy it keeps (src-tauri/src/patch.rs implements the same rules; both sides
 * are tested against the same cases).
 *
 * Patch shape:
 *   { set:   { title: "New" },                     // changed plain fields
 *     lists: { scenes: { upsert: [scene, ...],     // new or changed items (by id)
 *                        remove: ["id", ...],      // deleted items
 *                        order:  ["id", ...] } } } // full id order, only when it changed
 * Pure: no Svelte, no Tauri.
 */
import type { Project } from "./types";

/** The project fields that are lists of items with an `id`. Everything else is a plain field. */
export const LIST_FIELDS = [
  "chapters",
  "scenes",
  "issues",
  "pages",
  "snapshots",
  "characters",
  "places",
  "notes",
  "plotlines",
] as const;
export type ListField = (typeof LIST_FIELDS)[number];

export type ListPatch = { upsert?: unknown[]; remove?: string[]; order?: string[] };
export type ProjectPatch = {
  set?: Record<string, unknown>;
  lists?: Partial<Record<ListField, ListPatch>>;
};

/** What to send: nothing, a patch, or the whole project (when a patch can't describe it safely). */
export type Delta = { kind: "none" } | { kind: "patch"; patch: ProjectPatch } | { kind: "full" };

type Item = { id: string };
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

function idsOf(items: unknown): string[] | null {
  if (!Array.isArray(items)) return null;
  const ids: string[] = [];
  for (const it of items) {
    const id = (it as Item | null)?.id;
    if (typeof id !== "string") return null;
    ids.push(id);
  }
  return new Set(ids).size === ids.length ? ids : null; // duplicates: a patch can't be exact
}

/** What changed from `prev` to `next`. */
export function diffProject(prev: Project, next: Project): Delta {
  const p = prev as unknown as Record<string, unknown>;
  const n = next as unknown as Record<string, unknown>;
  const patch: ProjectPatch = {};

  for (const key of Object.keys(n)) {
    if ((LIST_FIELDS as readonly string[]).includes(key)) continue;
    if (!same(p[key], n[key])) (patch.set ??= {})[key] = n[key];
  }
  // A plain field that disappeared can't be described: send everything.
  for (const key of Object.keys(p)) {
    if (!(key in n) && !(LIST_FIELDS as readonly string[]).includes(key)) return { kind: "full" };
  }

  for (const field of LIST_FIELDS) {
    const before = p[field];
    const after = n[field];
    if (same(before, after)) continue;
    const beforeIds = idsOf(before);
    const afterIds = idsOf(after);
    if (!beforeIds || !afterIds) return { kind: "full" };

    const old = new Map((before as Item[]).map((it) => [it.id, it]));
    const lp: ListPatch = {};
    const upsert = (after as Item[]).filter((it) => !old.has(it.id) || !same(old.get(it.id), it));
    if (upsert.length) lp.upsert = upsert;
    const kept = new Set(afterIds);
    const remove = beforeIds.filter((id) => !kept.has(id));
    if (remove.length) lp.remove = remove;
    if (!same(beforeIds, afterIds)) lp.order = afterIds;
    (patch.lists ??= {})[field] = lp;
  }

  return patch.set || patch.lists ? { kind: "patch", patch } : { kind: "none" };
}

/** Apply a patch to a copy of `base`. The reference implementation that Rust mirrors. */
export function applyPatch(base: Project, patch: ProjectPatch): Project {
  const out = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch.set ?? {})) {
    if ((LIST_FIELDS as readonly string[]).includes(k)) throw new Error(`"${k}" is a list`);
    out[k] = v;
  }
  for (const [name, lp] of Object.entries(patch.lists ?? {})) {
    if (!(LIST_FIELDS as readonly string[]).includes(name)) throw new Error(`unknown list "${name}"`);
    let items = ((out[name] as Item[] | undefined) ?? []).slice();
    const gone = new Set(lp?.remove ?? []);
    items = items.filter((it) => !gone.has(it.id));
    for (const up of (lp?.upsert ?? []) as Item[]) {
      if (typeof up?.id !== "string") throw new Error("an upserted item has no id");
      const i = items.findIndex((it) => it.id === up.id);
      if (i >= 0) items[i] = JSON.parse(JSON.stringify(up));
      else items.push(JSON.parse(JSON.stringify(up)));
    }
    if (lp?.order) {
      const pool = new Map(items.map((it) => [it.id, it]));
      const ordered = lp.order.map((id) => pool.get(id)).filter((it): it is Item => !!it);
      if (ordered.length !== items.length) throw new Error("order does not list every item");
      items = ordered;
    }
    out[name] = items;
  }
  return out as unknown as Project;
}
