/**
 * The "platform": everything Fabulator needs from the machine it runs on that a
 * web page cannot do itself: file dialogs, reading and writing project files,
 * crash-recovery copies, imported themes, native message boxes, the window's
 * close button.
 *
 * The app talks to this interface only. Today there is one implementation
 * (desktop, via Tauri → Rust, in tauri.ts). Android (content URIs instead of
 * paths) or a different backend can be added by implementing the same
 * interface, without touching the editor, the Timeline or the save logic.
 *
 * Rules for implementations:
 *  - Every method either resolves or rejects with an Error/string that is fit to show to the person.
 *  - A `Location` is opaque to the app: a path on desktop, perhaps a content URI elsewhere.
 *  - Pickers resolve to null when the person cancels (that is not an error).
 */
import type { Project } from "../types";

/** Where a file or folder lives. Opaque: never parse or build one in app code. */
export type Location = string;

export type DialogKind = "info" | "warning" | "error";
export type FileFilter = { name: string; extensions: string[] };

export type ConfirmOptions = { title: string; kind?: DialogKind; okLabel?: string; cancelLabel?: string };
export type NoticeOptions = { title: string; kind?: DialogKind };

/** One file of a project folder: a path relative to the folder, and its text. */
export type FolderFile = { path: string; text: string };
export type FolderWriteReport = { written: number; unchanged: number; removed: number };

/** One theme file: its file name and text. */
export type ThemeFileData = { name: string; contents: string };

export interface Platform {
  // ── Dialogs ──────────────────────────────────────────────
  /** Yes/no question. Resolves true for the OK button. */
  confirm(message: string, options: ConfirmOptions): Promise<boolean>;
  /** A message box with one button. */
  notify(message: string, options: NoticeOptions): Promise<void>;
  pickOpenFile(options: { title: string; filters: FileFilter[] }): Promise<Location | null>;
  pickSaveFile(options: { title: string; defaultName: string; filters: FileFilter[] }): Promise<Location | null>;
  pickFolder(options: { title: string }): Promise<Location | null>;

  // ── Project files ────────────────────────────────────────
  /** The built-in sample story. */
  sampleProject(): Promise<Project>;
  /** The file's JSON as stored (old formats are upgraded by the app, not here). */
  readProject(location: Location): Promise<unknown>;
  /** Write the project atomically; with `forceBackup`, keep a copy of the previous file first. */
  saveProject(location: Location, project: Project, options: { forceBackup: boolean }): Promise<void>;
  /** Keep an untouched copy of the file as it is on disk (before an upgraded version replaces it). */
  backupProject(location: Location): Promise<void>;

  // ── Other files ──────────────────────────────────────────
  readText(location: Location): Promise<string>;
  /** Write bytes (an export, a theme file) to a chosen location. */
  writeBytes(location: Location, bytes: Uint8Array): Promise<void>;
  writeProjectFolder(folder: Location, files: FolderFile[]): Promise<FolderWriteReport>;
  readProjectFolder(folder: Location): Promise<FolderFile[]>;

  // ── Work that exists only in memory (not saved yet) ──────
  /** A copy of a project that has no file yet. */
  recovery: {
    write(project: Project): Promise<void>;
    /** The copy as stored (raw JSON), or null. */
    read(): Promise<unknown>;
    /** Remove it; with `keep`, set it aside as "discarded" instead of deleting. */
    clear(keep: boolean): Promise<void>;
  };
  /** The live mirror of the project being edited (survives a view reload or a crash). */
  live: {
    mirror(project: Project, path: Location | null): Promise<void>;
    /** `{ project, path, source: "memory" | "disk" }` as stored, or null. */
    read(): Promise<unknown>;
    clear(): Promise<void>;
  };

  // ── Imported colour themes ───────────────────────────────
  themes: {
    list(): Promise<string[]>;
    save(fileName: string, contents: string): Promise<void>;
    remove(fileName: string): Promise<void>;
    saveMany(files: ThemeFileData[]): Promise<void>;
    removeMany(fileNames: string[]): Promise<void>;
    readFolder(folder: Location): Promise<ThemeFileData[]>;
  };

  // ── Window ───────────────────────────────────────────────
  /**
   * Call `handler` when the person tries to close the window; the window closes only
   * if it resolves true. Returns a function that removes the hook.
   */
  onCloseRequested(handler: () => Promise<boolean>): Promise<() => void>;
}
