// Notes: add, edit, delete.
// Part of the app's state; see docs/technical/frontend-structure.md.
import type { Note } from "../../model/types";
import { project, touch, uid } from "./core";

export function updateNote(id: string, fields: Partial<Note>) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      notes: proj.notes.map((n) => (n.id === id ? { ...n, ...fields } : n)),
    };
  });
}

export function addNote(): string {
  const id = uid("note");
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    const note: Note = {
      id,
      title: "New Note",
      content: "",
      tags: [],
    };
    return { ...proj, notes: [...proj.notes, note] };
  });
  return id;
}

export function deleteNote(id: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      notes: proj.notes.filter((n) => n.id !== id),
    };
  });
}
