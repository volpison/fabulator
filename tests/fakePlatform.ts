/**
 * An in-memory Platform for tests: a pretend disk, scripted dialog answers, and a
 * record of what the app asked for.
 */
import { toLocation, type Platform, type FolderFile, type ThemeFileData } from "../src/lib/platform/index.ts";

export type Fake = ReturnType<typeof createFakePlatform>;

export function createFakePlatform(sample: unknown = { title: "SAMPLE" }) {
  const state = {
    /** Pretend disk: location → raw JSON as stored. */
    files: new Map<string, unknown>(),
    folders: new Map<string, FolderFile[]>(),
    recovery: null as unknown,
    discarded: null as unknown,
    live: null as unknown,
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
    async readProject(location) {
      if (!state.files.has(location)) throw new Error(`no such file: ${location}`);
      return clone(state.files.get(location));
    },
    async saveProject(location, project, o) {
      maybeFail("save");
      note(`save ${location}${o.forceBackup ? " (backup)" : ""}`);
      state.files.set(location, clone(project));
    },
    async backupProject(location) {
      note(`backup ${location}`);
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

    recovery: {
      async write(project) {
        note("recovery.write");
        state.recovery = clone(project);
      },
      async read() {
        return clone(state.recovery) ?? null;
      },
      async clear(keep) {
        note(`recovery.clear${keep ? "(keep)" : ""}`);
        if (keep && state.recovery) state.discarded = state.recovery;
        state.recovery = null;
      },
    },
    live: {
      async mirror(project, path) {
        note("live.mirror");
        state.live = { path, project: clone(project) };
      },
      async read() {
        return clone(state.live) ?? null;
      },
      async clear() {
        note("live.clear");
        state.live = null;
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
