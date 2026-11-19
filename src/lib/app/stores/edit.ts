// Apply a pure edit to the project (with automatic snapshots) and mark it changed.
// Part of the app's state; see docs/technical/frontend-structure.md.
import { autoSnapshotNodes, autoSnapshotPages, autoSnapshotScriptScenes } from "../../tools/snapshots";
import type { Project } from "../../model/types";
import { project, touch, uid } from "./core";

/** Apply a pure edit; the project is only marked changed if the edit changed something. */
export function editProject(fn: (p: Project) => Project) {
  project.update((proj) => {
    if (!proj) return proj;
    // A page whose writing changed gets an auto snapshot of how it was (at most every 30 minutes).
    const edited = fn(proj);
    const id = () => uid("snap");
    const next = autoSnapshotNodes(proj, autoSnapshotScriptScenes(proj, autoSnapshotPages(proj, edited, Date.now(), id), Date.now(), id), Date.now(), id);
    if (next !== proj) touch();
    return next;
  });
}
