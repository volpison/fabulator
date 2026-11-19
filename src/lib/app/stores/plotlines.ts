// Plotlines: add, rename, recolour, move, delete.
// Part of the app's state; see docs/technical/frontend-structure.md.
import { addPlotline, movePlotlineBy, removePlotline, updatePlotlineIn } from "../../model/plotlines";
import { project, touch, uid } from "./core";

/** Append a plotline (lane) with the next free colour. Returns its id. */
export function addPlotlineToProject(name?: string): string {
  const id = uid("pl");
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return { ...proj, plotlines: addPlotline(proj.plotlines, id, name) };
  });
  return id;
}

export function updatePlotline(id: string, fields: { name?: string; color?: string }) {
  project.update((proj) => {
    if (!proj) return proj;
    const plotlines = updatePlotlineIn(proj.plotlines, id, fields);
    if (plotlines === proj.plotlines) return proj;
    touch();
    return { ...proj, plotlines };
  });
}

/** Delete a plotline; its scenes move to another one. False if it is the last. */
export function deletePlotline(id: string): boolean {
  let done = false;
  project.update((proj) => {
    if (!proj) return proj;
    const r = removePlotline(proj.plotlines, proj.scenes, id);
    if (!r) return proj;
    touch();
    done = true;
    return { ...proj, ...r };
  });
  return done;
}

export function movePlotline(id: string, delta: number) {
  project.update((proj) => {
    if (!proj) return proj;
    const plotlines = movePlotlineBy(proj.plotlines, id, delta);
    if (plotlines === proj.plotlines) return proj;
    touch();
    return { ...proj, plotlines };
  });
}
