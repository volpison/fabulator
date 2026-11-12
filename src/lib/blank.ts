/** The empty story a new session starts with (and File → New story creates). */
import { CURRENT_SCHEMA_VERSION } from "./migrate";
import { DEFAULT_STORY_FORMAT, type StoryFormatId } from "./formats";
import { DEFAULT_SCRIPT_STYLE, newPage } from "./comic";
import type { Project } from "./types";

export function blankProject(newId: (prefix: string) => string): Project {
  const chapterId = newId("ch");
  const plotlineId = newId("pl");
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    story_format: DEFAULT_STORY_FORMAT,
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
        notes: "",
        todos: [],
        when: "",
      },
    ],
    issues: [],
    pages: [],
    snapshots: [],
    characters: [],
    places: [],
    notes: [],
  };
}

/** The empty comic a new comic starts with: one issue with one page, in the chosen scripting style. */
export function blankComic(newId: (prefix: string) => string, style = DEFAULT_SCRIPT_STYLE): Project {
  const issueId = newId("is");
  const plotlineId = newId("pl");
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    story_format: "comic",
    script_style: style,
    id: newId("proj"),
    title: "Untitled comic",
    premise: "",
    genre: "",
    theme: "",
    chapters: [],
    scenes: [],
    issues: [{ id: issueId, title: "Issue 1", summary: "" }],
    pages: [newPage(newId, issueId, 0, plotlineId)],
    plotlines: [{ id: plotlineId, name: "Main Plot", color: "#3b82f6" }],
    snapshots: [],
    characters: [],
    places: [],
    notes: [],
  };
}

/** A new, empty project in the given format. */
export function blankProjectFor(format: StoryFormatId, newId: (prefix: string) => string): Project {
  return format === "comic" ? blankComic(newId) : blankProject(newId);
}
