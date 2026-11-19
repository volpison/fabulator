// Taking, deleting and restoring snapshots.
// Part of the app's state; see docs/technical/frontend-structure.md.
import { makeNodeSnapshot } from "../../game/gamesnapshots";
import { applyRestore, makePageSnapshot, makeScriptSnapshot, makeSnapshot } from "../../tools/snapshots";
import { project, touch, uid } from "./core";

/** Save the scene as it is now. Returns the snapshot id. */
export function takeSnapshot(sceneId: string, label: string): string | null {
  const id = uid("snap");
  let taken = false;
  project.update((proj) => {
    if (!proj) return proj;
    const scene = proj.scenes.find((s) => s.id === sceneId);
    const page = scene ? undefined : proj.pages.find((pg) => pg.id === sceneId);
    const script = scene || page ? undefined : proj.script_scenes.find((x) => x.id === sceneId);
    const node = scene || page || script ? undefined : proj.game?.nodes.find((x) => x.id === sceneId);
    if (!scene && !page && !script && !node) return proj;
    touch();
    taken = true;
    return {
      ...proj,
      snapshots: [
        ...proj.snapshots,
        scene
          ? makeSnapshot(scene, "manual", label.trim(), Date.now(), id)
          : page
            ? makePageSnapshot(page, "manual", label.trim(), Date.now(), id)
            : script
              ? makeScriptSnapshot(script, "manual", label.trim(), Date.now(), id)
              : makeNodeSnapshot(node!, "manual", label.trim(), Date.now(), id),
      ],
    };
  });
  return taken ? id : null;
}

export function deleteSnapshot(snapshotId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return { ...proj, snapshots: proj.snapshots.filter((s) => s.id !== snapshotId) };
  });
}

/** Permanently forget every snapshot of a scene that no longer exists. */
export function deleteSceneSnapshots(sceneId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return { ...proj, snapshots: proj.snapshots.filter((s) => s.scene_id !== sceneId) };
  });
}

/**
 * Bring a snapshot back. If the scene still exists its title, synopsis and
 * text are replaced (the current version is saved as a safety snapshot first,
 * so this can be undone). If the scene was deleted it is recreated.
 * Returns the id of the restored scene, or null if nothing happened.
 */
export function restoreSnapshot(snapshotId: string): string | null {
  let restored: string | null = null;
  project.update((proj) => {
    if (!proj) return proj;
    const result = applyRestore(proj, snapshotId, Date.now(), uid);
    restored = result.sceneId;
    if (result.project !== proj) touch();
    return result.project;
  });
  return restored;
}
