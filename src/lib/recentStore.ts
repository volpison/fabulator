/** The "Open recent" list as a store, remembered between sessions (per viewer, best effort). */
import { writable, get } from "svelte/store";
import { platform } from "./platform";
import type { Location } from "./platform/types";
import { addRecent, cleanRecents, removeRecent, type RecentFile } from "./recent";

const KEY = "fabulator.recentFiles";

function load(): RecentFile[] {
  try {
    return cleanRecents(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export const recentFiles = writable<RecentFile[]>(load());

recentFiles.subscribe((list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private window, storage full: the list just won't be remembered */
  }
});

/** A file was opened or saved: move it to the top. */
export function rememberRecent(location: Location): void {
  recentFiles.set(addRecent(get(recentFiles), location, platform().displayName(location), Date.now()));
}

export function forgetRecent(location: Location): void {
  recentFiles.set(removeRecent(get(recentFiles), location));
}

export function clearRecents(): void {
  recentFiles.set([]);
}
