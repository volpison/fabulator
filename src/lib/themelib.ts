/**
 * Bulk theme handling (pure, tested): planning an import of a whole folder of
 * Base16 / Base24 / VS Code / Fabulator theme files, and filtering a large
 * theme list by dark / light, collection and search text.
 */
import { importThemeText, slugify, specToTheme, themeIdFor, type ThemeSpec } from "./theme-file";
import type { ThemeInfo } from "./themes";

export const MAX_FOLDER_THEMES = 2000;
const EXTENSIONS = /\.(ya?ml|json)$/i;

export type FolderThemeFile = { name: string; text: string };
export type PlannedTheme = { spec: ThemeSpec; fileName: string; source: string };
export type FolderImportPlan = {
  items: PlannedTheme[];
  skipped: { name: string; reason: string }[];
  /** Themes that were renamed to avoid replacing one you already have. */
  renamed: number;
};

/** "base16/dracula.yaml" -> "dracula.yaml" */
const baseName = (path: string) => path.split("/").pop() ?? path;

/**
 * Decide what a folder import will add. Never replaces an installed theme: a
 * theme that is already there with identical colours is skipped, and one that
 * only shares a name is added under a new name ("Name (Base24)", "Name (2)").
 */
export function planFolderImport(
  files: FolderThemeFile[],
  collection: string,
  existing: ThemeInfo[]
): FolderImportPlan {
  const taken = new Map(existing.map((t) => [t.id, t]));
  const plan: FolderImportPlan = { items: [], skipped: [], renamed: 0 };

  for (const f of files) {
    if (!EXTENSIONS.test(f.name)) continue;
    if (plan.items.length >= MAX_FOLDER_THEMES) {
      plan.skipped.push({ name: f.name, reason: `Over the limit of ${MAX_FOLDER_THEMES} themes per import.` });
      continue;
    }
    const parsed = importThemeText(f.text);
    if (!parsed.ok) {
      plan.skipped.push({ name: f.name, reason: parsed.error });
      continue;
    }

    const spec: ThemeSpec = { ...parsed.spec, collection: parsed.spec.collection ?? (collection || undefined) };
    const palette = JSON.stringify(specToTheme(spec).palette);

    let name = spec.name;
    let id = themeIdFor(name);
    const same = taken.get(id);
    if (same && JSON.stringify(same.palette) === palette) {
      plan.skipped.push({ name: f.name, reason: `“${name}” is already installed.` });
      continue;
    }
    if (same) {
      const candidates = [parsed.source === "base24" ? `${spec.name} (Base24)` : "", ...Array.from({ length: 98 }, (_, i) => `${spec.name} (${i + 2})`)]
        .filter(Boolean)
        .map((n) => (n.length > 60 ? `${spec.name.slice(0, 60 - (n.length - spec.name.length))}${n.slice(spec.name.length)}` : n));
      const free = candidates.find((n) => !taken.has(themeIdFor(n)));
      if (!free) {
        plan.skipped.push({ name: f.name, reason: `Too many themes named “${spec.name}”.` });
        continue;
      }
      name = free;
      id = themeIdFor(name);
      plan.renamed++;
    }

    const final: ThemeSpec = { ...spec, name };
    taken.set(id, { ...specToTheme(final) });
    plan.items.push({ spec: final, fileName: `${slugify(name)}.json`, source: parsed.source });
  }
  return plan;
}

// ─── Browsing a large list ─────────────────────────────────

export type ThemeMode = "all" | "dark" | "light";

export type ThemeFilter = {
  mode: ThemeMode;
  query: string;
  /** "" = every collection; BUILT_IN and IMPORTED are the two unnamed groups. */
  collection: string;
};

export const BUILT_IN = "Built-in";
export const IMPORTED = "Imported";

export const collectionOf = (t: ThemeInfo, builtIns: ReadonlySet<string>): string =>
  builtIns.has(t.id) ? BUILT_IN : t.collection || IMPORTED;

export function filterThemes(list: ThemeInfo[], f: ThemeFilter, builtIns: ReadonlySet<string>): ThemeInfo[] {
  const q = f.query.trim().toLowerCase();
  return list.filter(
    (t) =>
      (f.mode === "all" || (f.mode === "dark") === t.dark) &&
      (!f.collection || collectionOf(t, builtIns) === f.collection) &&
      (!q || t.label.toLowerCase().includes(q))
  );
}

export function countByMode(list: ThemeInfo[]): Record<ThemeMode, number> {
  const dark = list.filter((t) => t.dark).length;
  return { all: list.length, dark, light: list.length - dark };
}

/** Collections with their theme counts: Built-in first, Imported last, the rest alphabetical. */
export function collectionsOf(list: ThemeInfo[], builtIns: ReadonlySet<string>): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of list) {
    const c = collectionOf(t, builtIns);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const rank = (n: string) => (n === BUILT_IN ? 0 : n === IMPORTED ? 2 : 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** Last path part of a picked folder, usable as a collection name. */
export function collectionNameFromPath(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return (parts.pop() || "Imported").trim().slice(0, 60) || "Imported";
}

export { baseName as themeFileBaseName };
