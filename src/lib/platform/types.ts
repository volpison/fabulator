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

/**
 * Where a file or folder lives. Opaque: app code must never parse or build one (no
 * splitting on "/"), only keep it, show it through `displayName` / `describe`, and hand
 * it back to the platform. On desktop it is a path; on Android it would be a content URI.
 * The brand makes the compiler enforce this.
 */
export type Location = string & { readonly __location: unique symbol };

/** Turn text that came from a platform (or from stored JSON) back into a Location. */
export const toLocation = (value: string): Location => value as Location;

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
  // ── Naming locations (synchronous, so they can be used while rendering) ──
  /** Short name to show in lists and the status bar, e.g. "wolf.fabulator.json". */
  displayName(location: Location): string;
  /** Longer human-readable form for tooltips, e.g. the full path. */
  describe(location: Location): string;

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
  /**
   * Open a project file. `data` is the file's JSON as stored (old formats are upgraded by
   * the app, not here). The platform's rule: a file written by an older version is backed
   * up BEFORE it can be overwritten with the upgraded format (`backedUp` says it was);
   * if that backup fails, opening fails.
   */
  openProject(location: Location): Promise<{ data: unknown; backedUp: boolean }>;
  /**
   * Write the project atomically; with `forceBackup`, keep a copy of the previous file
   * first (otherwise backups are rotated and throttled). Never leaves a half-written file.
   */
  saveProject(location: Location, project: Project, options: { forceBackup: boolean }): Promise<void>;

  // ── Other files ──────────────────────────────────────────
  readText(location: Location): Promise<string>;
  /** Write bytes (an export, a theme file) to a chosen location. */
  writeBytes(location: Location, bytes: Uint8Array): Promise<void>;
  writeProjectFolder(folder: Location, files: FolderFile[]): Promise<FolderWriteReport>;
  readProjectFolder(folder: Location): Promise<FolderFile[]>;

  // ── Unsaved work ─────────────────────────────────────────
  /**
   * What would be lost if the app died right now. While there are unsaved changes the app
   * sends the whole project; the platform keeps the latest copy somewhere that survives a
   * view reload (memory) and a crash (disk). One store for projects with and without a file.
   */
  unsaved: {
    /** Keep the project (and the file it belongs to, if any) as the latest unsaved copy. */
    keep(project: Project, path: Location | null): Promise<void>;
    /**
     * The copy to offer, as stored (`{ project, path, source }`, see mirror.ts), or null.
     * `source` "memory" = the view was reloaded (carry on silently); "disk" or "legacy" =
     * the app restarted or crashed (ask first).
     */
    read(): Promise<unknown>;
    /** Forget it; with `keepCopy`, set the newest copy aside as a single "discarded" one. */
    discard(keepCopy: boolean): Promise<void>;
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
