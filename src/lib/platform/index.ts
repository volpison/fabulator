/**
 * The one place the app gets its Platform from. main.ts installs the real one at
 * start-up; tests install a fake (see tests/fakePlatform.ts). Nothing else in the
 * app imports Tauri.
 */
import type { Platform } from "./types";
export { toLocation } from "./types";

export type {
  Platform,
  Location,
  DialogKind,
  FileFilter,
  ConfirmOptions,
  NoticeOptions,
  FolderFile,
  FolderWriteReport,
  ThemeFileData,
} from "./types";

let current: Platform | null = null;

export function setPlatform(p: Platform | null): void {
  current = p;
}

export function platform(): Platform {
  if (!current) throw new Error("No platform installed (setPlatform was not called).");
  return current;
}
