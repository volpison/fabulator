/** Pure helpers for the "Open recent" list. No Svelte, no Tauri, no path parsing. */
import { toLocation, type Location } from "./platform/types";

export const MAX_RECENT = 10;

export type RecentFile = {
  location: Location;
  /** Display name, taken from the platform when the file was last used. */
  name: string;
  /** When it was last opened or saved (ms since epoch). */
  at: number;
};

/** Whatever was stored → a clean list, newest first, no duplicates, at most MAX_RECENT. Never throws. */
export function cleanRecents(raw: unknown): RecentFile[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RecentFile[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (typeof r.location !== "string" || !r.location || seen.has(r.location)) continue;
    seen.add(r.location);
    out.push({
      location: toLocation(r.location),
      name: typeof r.name === "string" && r.name ? r.name : r.location,
      at: Number.isFinite(Number(r.at)) ? Number(r.at) : 0,
    });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX_RECENT);
}

/** Put a file at the top (replacing an older entry for the same location). */
export function addRecent(list: RecentFile[], location: Location, name: string, at: number): RecentFile[] {
  return cleanRecents([{ location, name, at }, ...list.filter((r) => r.location !== location)]);
}

export function removeRecent(list: RecentFile[], location: Location): RecentFile[] {
  return list.filter((r) => r.location !== location);
}

/**
 * Menu labels: the file name, and when two entries share a name, the
 * platform's longer description in brackets so they can be told apart.
 */
export function recentLabels(list: RecentFile[], describe: (l: Location) => string): string[] {
  const count = new Map<string, number>();
  for (const r of list) count.set(r.name, (count.get(r.name) ?? 0) + 1);
  return list.map((r) => ((count.get(r.name) ?? 0) > 1 ? `${r.name}  (${describe(r.location)})` : r.name));
}
