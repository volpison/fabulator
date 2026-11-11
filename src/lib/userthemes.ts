/**
 * Imported colour themes: load them from the app's themes folder, import a
 * file (Fabulator JSON or Base16), export the current theme, remove one.
 * The parsing/validation lives in theme-file.ts (tested); this is the glue.
 */
import { platform } from "./platform";
import { get } from "svelte/store";
import { currentTheme, customThemes, settings, updateSettings } from "./appearance";
import {
  importThemeText,
  serializeSpec,
  slugify,
  specToTheme,
  themeToSpec,
  type ThemeSpec,
} from "./theme-file";
import { THEMES, type ThemeInfo } from "./themes";
import { BUILT_IN, IMPORTED, collectionNameFromPath, planFolderImport } from "./themelib";

export type ImportOutcome =
  | { status: "imported"; name: string; warnings: string[] }
  | { status: "error"; message: string }
  | { status: "cancelled" };

/** Read every saved theme; files that no longer parse are skipped. */
export async function loadUserThemes(): Promise<void> {
  try {
    const texts = await platform().themes.list();
    const byId = new Map<string, ThemeInfo>();
    for (const text of texts) {
      const parsed = importThemeText(text);
      if (parsed.ok) {
        const info = specToTheme(parsed.spec);
        byId.set(info.id, info);
      }
    }
    // Replace the provisional (cached) theme with the real list.
    customThemes.set([...byId.values()]);
  } catch (e) {
    console.warn("could not load imported themes", e);
  }
}

/** Save a gallery theme like an imported one and switch to it. Returns an error message, or null. */
export async function installGalleryTheme(spec: ThemeSpec): Promise<string | null> {
  try {
    const info = specToTheme(spec);
    await platform().themes.save(`${slugify(spec.name)}.json`, serializeSpec(spec));
    customThemes.update((list) => [...list.filter((t) => t.id !== info.id), info]);
    updateSettings({ theme: info.id });
    return null;
  } catch (e) {
    return String(e);
  }
}

export async function importThemeFromFile(): Promise<ImportOutcome> {
  try {
    const chosen = await platform().pickOpenFile({
      title: "Import colour theme",
      filters: [{ name: "Colour theme (Fabulator, VS Code or Base16)", extensions: ["json", "yaml", "yml"] }],
    });
    if (!chosen) return { status: "cancelled" };

    const text = await platform().readText(chosen);
    const parsed = importThemeText(text);
    if (!parsed.ok) return { status: "error", message: parsed.error };

    const info = specToTheme(parsed.spec);
    // Keep the author's colours (not the derived palette), so the saved file stays easy to edit.
    await platform().themes.save(`${slugify(parsed.spec.name)}.json`, serializeSpec(parsed.spec));

    customThemes.update((list) => [...list.filter((t) => t.id !== info.id), info]);
    updateSettings({ theme: info.id });
    return { status: "imported", name: info.label, warnings: parsed.warnings };
  } catch (e) {
    return { status: "error", message: String(e) };
  }
}

/** Save the theme currently in use as a Fabulator theme file anyone can import. */
export async function exportCurrentTheme(): Promise<ImportOutcome | { status: "exported"; path: string }> {
  try {
    const info = currentTheme();
    const spec: ThemeSpec = themeToSpec(info);
    const path = await platform().pickSaveFile({
      title: "Export colour theme",
      defaultName: `${slugify(info.label)}.theme.json`,
      filters: [{ name: "Fabulator theme", extensions: ["json"] }],
    });
    if (!path) return { status: "cancelled" };
    await platform().writeBytes(path, new TextEncoder().encode(serializeSpec(spec)));
    return { status: "exported", path };
  } catch (e) {
    return { status: "error", message: String(e) };
  }
}

export async function removeUserTheme(id: string): Promise<string | null> {
  if (!id.startsWith("user:")) return null;
  try {
    await platform().themes.remove(`${id.slice("user:".length)}.json`);
    customThemes.update((list) => list.filter((t) => t.id !== id));
    if (get(settings).theme === id) updateSettings({ theme: "system" });
    return null;
  } catch (e) {
    return String(e);
  }
}

export type FolderImportOutcome =
  | {
      status: "imported";
      collection: string;
      imported: number;
      renamed: number;
      skipped: { name: string; reason: string }[];
      /** How many came from each format, e.g. { base16: 180, base24: 20 }. */
      formats: Record<string, number>;
    }
  | { status: "error"; message: string }
  | { status: "cancelled" };

/** Import every theme file in a folder (Base16, Base24, VS Code, Fabulator) as one collection. */
export async function importThemeFolder(): Promise<FolderImportOutcome> {
  try {
    const chosen = await platform().pickFolder({
      title: "Choose a folder of themes (Base16 / Base24 / VS Code / Fabulator files)",
    });
    if (!chosen) return { status: "cancelled" };

    const files = await platform().themes.readFolder(chosen);
    if (files.length === 0) {
      return { status: "error", message: "No .yaml, .yml or .json files found in that folder (subfolders up to four levels deep are included)." };
    }
    const collection = collectionNameFromPath(chosen);
    const plan = planFolderImport(
      files.map((f) => ({ name: f.name, text: f.contents })),
      collection,
      get(customThemes)
    );

    if (plan.items.length > 0) {
      await platform().themes.saveMany(plan.items.map((i) => ({ name: i.fileName, contents: serializeSpec(i.spec) })));
      const added = plan.items.map((i) => specToTheme(i.spec));
      customThemes.update((list) => [...list, ...added]);
    }
    const formats: Record<string, number> = {};
    for (const i of plan.items) formats[i.source] = (formats[i.source] ?? 0) + 1;
    return { status: "imported", collection, imported: plan.items.length, renamed: plan.renamed, skipped: plan.skipped, formats };
  } catch (e) {
    return { status: "error", message: String(e) };
  }
}

/** Remove every imported theme of one collection. Returns an error message, or null. */
export async function removeCollection(name: string): Promise<string | null> {
  if (name === BUILT_IN || name === IMPORTED) return "That group cannot be removed as a whole.";
  const doomed = get(customThemes).filter((t) => t.collection === name && t.id.startsWith("user:"));
  if (doomed.length === 0) return null;
  try {
    await platform().themes.removeMany(doomed.map((t) => `${t.id.slice("user:".length)}.json`));
    const gone = new Set(doomed.map((t) => t.id));
    customThemes.update((list) => list.filter((t) => !gone.has(t.id)));
    if (gone.has(get(settings).theme)) updateSettings({ theme: "system" });
    return null;
  } catch (e) {
    return String(e);
  }
}

/** Ids of the built-in themes (for grouping). */
export const BUILT_IN_IDS: ReadonlySet<string> = new Set(THEMES.map((t) => t.id));
