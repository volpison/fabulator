/**
 * An in-memory Platform for tests: a pretend disk, scripted dialog answers, and a
 * record of what the app asked for.
 */
import { CURRENT_SCHEMA_VERSION } from "../src/lib/migrate.ts";
import { applyPatch } from "../src/lib/patch.ts";
import type { Project } from "../src/lib/types.ts";
import { toLocation, type Platform, type FolderFile, type ThemeFileData } from "../src/lib/platform/index.ts";

export type Fake = ReturnType<typeof createFakePlatform>;

export function createFakePlatform(sample: unknown = { title: "SAMPLE" }) {
  const state = {
    /** Pretend disk: location → raw JSON as stored. */
    files: new Map<string, unknown>(),
    folders: new Map<string, FolderFile[]>(),
    /** The unsaved-work copy: `{ project, path, source }` (tests may set any source). */
    unsaved: null as null | { project: unknown; path: string | null; source: "memory" | "disk" | "legacy" },
    unsavedRevision: 0,
    /** How many saves were made from the kept copy (the project was not sent again). */
    keptSaves: 0,
    discarded: null as unknown,
    themes: new Map<string, string>(),
    /** Scripted answers, consumed in order (defaults: confirm → false, pickers → null). */
    confirmAnswers: [] as boolean[],
    openAnswers: [] as (string | null)[],
    saveAnswers: [] as (string | null)[],
    folderAnswers: [] as (string | null)[],
    /** What the app did. */
    log: [] as string[],
    confirms: [] as string[],
    notices: [] as string[],
    /** Set to make the next call of that kind fail. */
    failNext: null as string | null,
    /** Runs in the middle of the next save (to simulate typing while a save is in progress). */
    duringSave: null as null | (() => void),
  };
  const note = (s: string) => state.log.push(s);
  const maybeFail = (kind: string) => {
    if (state.failNext === kind) {
      state.failNext = null;
      throw new Error(`${kind} failed`);
    }
  };
  const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

  const platform: Platform = {
    displayName: (l) => l.split(/[/\\]/).filter(Boolean).pop() ?? l,
    describe: (l) => l,
    async confirm(message) {
      state.confirms.push(message);
      return state.confirmAnswers.shift() ?? false;
    },
    async notify(message) {
      state.notices.push(message);
    },
    async pickOpenFile() {
      const a = state.openAnswers.shift();
      return a ? toLocation(a) : null;
    },
    async pickSaveFile() {
      const a = state.saveAnswers.shift();
      return a ? toLocation(a) : null;
    },
    async pickFolder() {
      const a = state.folderAnswers.shift();
      return a ? toLocation(a) : null;
    },

    async sampleProject() {
      return clone(sample) as any;
    },
    async openProject(location) {
      if (!state.files.has(location)) throw new Error(`no such file: ${location}`);
      const data = clone(state.files.get(location)) as any;
      // The platform's rule: an older-format (or unversioned) file is backed up before it can be replaced.
      const backedUp = typeof data?.schema_version !== "number" || data.schema_version < CURRENT_SCHEMA_VERSION;
      if (backedUp) note(`backup ${location}`);
      return { data, backedUp };
    },
    async saveProject(location, project, o) {
      maybeFail("save");
      const hook = state.duringSave;
      state.duringSave = null;
      hook?.();
      note(`save ${location}${o.forceBackup ? " (backup)" : ""}`);
      state.files.set(location, clone(project));
    },

    async readText(location) {
      return String(state.files.get(location) ?? "");
    },
    async writeBytes(location, bytes) {
      state.files.set(location, new TextDecoder().decode(bytes));
    },
    async writeProjectFolder(folder, files) {
      state.folders.set(folder, clone(files));
      return { written: files.length, unchanged: 0, removed: 0 };
    },
    async readProjectFolder(folder) {
      return clone(state.folders.get(folder) ?? []);
    },

    unsaved: {
      async keep(project, path) {
        note("unsaved.keep");
        state.unsavedRevision += 1;
        state.unsaved = { project: clone(project), path, source: "memory" };
        return state.unsavedRevision;
      },
      async keepChanges(base, patch, path) {
        if (!state.unsaved || base !== state.unsavedRevision) return null;
        note("unsaved.keepChanges");
        state.unsavedRevision += 1;
        state.unsaved = { ...state.unsaved, project: applyPatch(state.unsaved.project as Project, patch), path };
        return state.unsavedRevision;
      },
      async saveKept(location, revision, o) {
        if (!state.unsaved || revision !== state.unsavedRevision) return false;
        maybeFail("save");
        const hook = state.duringSave;
        state.duringSave = null;
        hook?.();
        note(`save ${location}${o.forceBackup ? " (backup)" : ""}`);
        state.files.set(location, clone(state.unsaved.project));
        state.keptSaves += 1;
        return true;
      },
      async read() {
        return clone(state.unsaved) ?? null;
      },
      async discard(keepCopy) {
        note(`unsaved.discard${keepCopy ? "(keep)" : ""}`);
        if (keepCopy && state.unsaved) state.discarded = state.unsaved;
        state.unsaved = null;
      },
    },

    themes: {
      async list() {
        return [...state.themes.values()];
      },
      async save(fileName, contents) {
        state.themes.set(fileName, contents);
      },
      async remove(fileName) {
        state.themes.delete(fileName);
      },
      async saveMany(files: ThemeFileData[]) {
        for (const f of files) state.themes.set(f.name, f.contents);
      },
      async removeMany(names) {
        for (const n of names) state.themes.delete(n);
      },
      async readFolder() {
        return [];
      },
    },

    async onCloseRequested(handler) {
      (state as any).closeHandler = handler;
      return () => {
        (state as any).closeHandler = null;
      };
    },
  };
  return { platform, state };
}
