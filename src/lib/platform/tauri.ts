/**
 * Desktop platform: Tauri. Every `invoke` / dialog call in the app lives in this
 * file; the Rust commands it calls are in src-tauri/src/lib.rs.
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { toLocation, type Platform, type Location, type FolderFile, type FolderWriteReport, type ThemeFileData } from "./types";
import type { Project } from "../types";

const single = (r: string | string[] | null): Location | null => (!r || Array.isArray(r) ? null : toLocation(r));

const lastSegment = (path: string) => path.split(/[/\\]/).filter(Boolean).pop() ?? path;

export const tauriPlatform: Platform = {
  displayName: (location) => lastSegment(location),
  describe: (location) => location,

  confirm: (msg, o) =>
    ask(msg, { title: o.title, kind: o.kind ?? "warning", okLabel: o.okLabel, cancelLabel: o.cancelLabel }),
  notify: async (msg, o) => {
    await message(msg, { title: o.title, kind: o.kind ?? "info" });
  },
  pickOpenFile: async (o) => single(await open({ title: o.title, multiple: false, filters: o.filters })),
  pickSaveFile: async (o) => {
    const r = await save({ title: o.title, defaultPath: o.defaultName, filters: o.filters });
    return r ? toLocation(r) : null;
  },
  pickFolder: async (o) => single(await open({ title: o.title, directory: true, multiple: false })),

  sampleProject: () => invoke<Project>("sample_project"),
  openProject: async (path) => {
    const r = await invoke<{ data: unknown; backed_up: boolean }>("open_project", { path });
    return { data: r.data, backedUp: r.backed_up };
  },
  saveProject: (path, project, o) => invoke("save_project", { path, project, forceBackup: o.forceBackup }),

  readText: (path) => invoke<string>("read_text_file", { path }),
  writeBytes: (path, bytes) => invoke("write_export", { path, bytes: Array.from(bytes) }),
  writeProjectFolder: (dir, files) => invoke<FolderWriteReport>("write_project_folder", { dir, files }),
  readProjectFolder: (dir) => invoke<FolderFile[]>("read_project_folder", { dir }),

  unsaved: {
    keep: (project, path) => invoke<number>("keep_unsaved", { project, path }),
    keepChanges: (base, patch, path) => invoke<number | null>("keep_unsaved_changes", { base, patch, path }),
    read: () => invoke<unknown>("unsaved_work"),
    discard: (keepCopy) => invoke("discard_unsaved", { keepCopy }),
  },

  themes: {
    list: () => invoke<string[]>("list_user_themes"),
    save: (fileName, contents) => invoke("save_user_theme", { fileName, contents }),
    remove: (fileName) => invoke("delete_user_theme", { fileName }),
    saveMany: (files) => invoke("save_user_themes", { files }),
    removeMany: (fileNames) => invoke("delete_user_themes", { fileNames }),
    readFolder: (dir) => invoke<ThemeFileData[]>("read_theme_folder", { dir }),
  },

  onCloseRequested: (handler) =>
    getCurrentWindow().onCloseRequested(async (event) => {
      if (!(await handler())) event.preventDefault();
    }),
};
