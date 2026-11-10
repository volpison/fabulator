/**
 * Imported colour themes: load them from the app's themes folder, import a
 * file (Fabulator JSON or Base16), export the current theme, remove one.
 * The parsing/validation lives in theme-file.ts (tested); this is the glue.
 */
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
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
    const texts = await invoke<string[]>("list_user_themes");
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
    await invoke("save_user_theme", {
      fileName: `${slugify(spec.name)}.json`,
      contents: serializeSpec(spec),
    });
    customThemes.update((list) => [...list.filter((t) => t.id !== info.id), info]);
    updateSettings({ theme: info.id });
    return null;
  } catch (e) {
    return String(e);
  }
}

export async function importThemeFromFile(): Promise<ImportOutcome> {
  try {
    const chosen = await open({
      title: "Import colour theme",
      multiple: false,
      filters: [{ name: "Colour theme (Fabulator, VS Code or Base16)", extensions: ["json", "yaml", "yml"] }],
    });
    if (!chosen || Array.isArray(chosen)) return { status: "cancelled" };

    const text = await invoke<string>("read_text_file", { path: chosen });
    const parsed = importThemeText(text);
    if (!parsed.ok) return { status: "error", message: parsed.error };

    const info = specToTheme(parsed.spec);
    // Keep the author's colours (not the derived palette), so the saved file stays easy to edit.
    await invoke("save_user_theme", {
      fileName: `${slugify(parsed.spec.name)}.json`,
      contents: serializeSpec(parsed.spec),
    });

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
    const path = await save({
      title: "Export colour theme",
      defaultPath: `${slugify(info.label)}.theme.json`,
      filters: [{ name: "Fabulator theme", extensions: ["json"] }],
    });
    if (!path) return { status: "cancelled" };
    const bytes = Array.from(new TextEncoder().encode(serializeSpec(spec)));
    await invoke("write_export", { path, bytes });
    return { status: "exported", path };
  } catch (e) {
    return { status: "error", message: String(e) };
  }
}

export async function removeUserTheme(id: string): Promise<string | null> {
  if (!id.startsWith("user:")) return null;
  try {
    await invoke("delete_user_theme", { fileName: `${id.slice("user:".length)}.json` });
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
    const chosen = await open({
      title: "Choose a folder of themes (Base16 / Base24 / VS Code / Fabulator files)",
      directory: true,
      multiple: false,
    });
    if (!chosen || Array.isArray(chosen)) return { status: "cancelled" };

    const files = await invoke<{ name: string; contents: string }[]>("read_theme_folder", { dir: chosen });
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
      await invoke("save_user_themes", {
        files: plan.items.map((i) => ({ name: i.fileName, contents: serializeSpec(i.spec) })),
      });
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
    await invoke("delete_user_themes", { fileNames: doomed.map((t) => `${t.id.slice("user:".length)}.json`) });
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
