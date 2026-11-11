/** Pure helpers for a scene's private notes and to-do list. No Svelte, no Tauri. */
import type { SceneTodo } from "./types";

export const MAX_TODO_LENGTH = 300;

/** Whatever was loaded (old file, hand-edited JSON) → a clean list. Never throws. */
export function cleanTodos(raw: unknown): SceneTodo[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SceneTodo[] = [];
  raw.forEach((x, i) => {
    if (!x || typeof x !== "object") return;
    const r = x as Record<string, unknown>;
    const text = typeof r.text === "string" ? r.text.replace(/\s+/g, " ").trim().slice(0, MAX_TODO_LENGTH) : "";
    if (!text) return;
    let id = typeof r.id === "string" && r.id ? r.id : `td-${i + 1}`;
    while (seen.has(id)) id += "x";
    seen.add(id);
    out.push({ id, text, done: r.done === true });
  });
  return out;
}

/** Add a to-do at the end. Blank text is ignored (same list returned). */
export function addTodoTo(todos: SceneTodo[], id: string, text: string): SceneTodo[] {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_TODO_LENGTH);
  return clean ? [...todos, { id, text: clean, done: false }] : todos;
}

export function toggleTodoIn(todos: SceneTodo[], id: string): SceneTodo[] {
  return todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

/** Change a to-do's text; emptying it removes the to-do. */
export function editTodoIn(todos: SceneTodo[], id: string, text: string): SceneTodo[] {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_TODO_LENGTH);
  if (!clean) return todos.filter((t) => t.id !== id);
  return todos.map((t) => (t.id === id && t.text !== clean ? { ...t, text: clean } : t));
}

export function removeTodoFrom(todos: SceneTodo[], id: string): SceneTodo[] {
  return todos.filter((t) => t.id !== id);
}

export function clearDone(todos: SceneTodo[]): SceneTodo[] {
  return todos.some((t) => t.done) ? todos.filter((t) => !t.done) : todos;
}

export function todoCounts(todos: SceneTodo[]): { open: number; done: number; total: number } {
  const done = todos.filter((t) => t.done).length;
  return { open: todos.length - done, done, total: todos.length };
}

/** "Notes · 2 open to-dos" style summary for the collapsed bar. */
export function summaryLine(notes: string, todos: SceneTodo[]): string {
  const { open, total } = todoCounts(todos);
  const parts: string[] = [];
  if (notes.trim()) parts.push("notes");
  if (total > 0) parts.push(open > 0 ? `${open} open to-do${open === 1 ? "" : "s"}` : "all to-dos done");
  return parts.join(" · ");
}

// Markdown-folder encoding: one header line per to-do, "[ ] text" / "[x] text".

export const todosToLines = (todos: SceneTodo[]): string[] => todos.map((t) => `[${t.done ? "x" : " "}] ${t.text}`);

export function linesToTodos(lines: string[]): SceneTodo[] {
  return cleanTodos(
    lines.map((l, i) => {
      const m = /^\s*\[([ xX])\]\s*(.*)$/.exec(l);
      return { id: `td-${i + 1}`, text: m ? m[2] : l, done: m ? m[1] !== " " : false };
    })
  );
}
