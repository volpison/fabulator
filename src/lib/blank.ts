/** The empty story a new session starts with (and File → New story creates). */
import { CURRENT_SCHEMA_VERSION } from "./migrate";
import type { Project } from "./types";

export function blankProject(newId: (prefix: string) => string): Project {
  const chapterId = newId("ch");
  const plotlineId = newId("pl");
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    id: newId("proj"),
    title: "Untitled story",
    premise: "",
    genre: "",
    theme: "",
    chapters: [{ id: chapterId, title: "Chapter 1", summary: "" }],
    plotlines: [{ id: plotlineId, name: "Main Plot", color: "#3b82f6" }],
    scenes: [
      {
        id: newId("sc"),
        title: "Untitled scene",
        summary: "",
        content: "",
        chapter_id: chapterId,
        order: 0,
        plotline_id: plotlineId,
        character_ids: [],
        place_ids: [],
        tags: [],
        status: "idea",
        color: "",
      },
    ],
    snapshots: [],
    characters: [],
    places: [],
    notes: [],
  };
}
