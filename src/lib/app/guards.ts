/**
 * Things a desktop app should not inherit from its browser engine: the
 * browser's right-click menu (Back / Refresh / Save as / Print) and its
 * reload / navigate / print / view-source shortcuts. A reload restarts the
 * whole app, so unsaved typing could be lost. Pure decisions live here (tested);
 * webviewGuards.ts attaches them to the window.
 */

export type KeyInfo = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };

/** Shortcuts that reload, navigate away, print, or open browser-only views. */
export function isBlockedBrowserKey(e: KeyInfo): boolean {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (key === "f5" || key === "f7") return true; // reload / caret browsing
  if (mod && !e.altKey && (key === "r" || key === "p" || key === "u" || key === "n" || key === "t")) return true; // reload, print, view source, new window / tab
  if (mod && !e.altKey && e.shiftKey && key === "n") return true; // new private window
  if (e.altKey && !mod && !e.shiftKey && (key === "arrowleft" || key === "arrowright")) return true; // history back/forward
  if (key === "browserback" || key === "browserforward" || key === "browserrefresh") return true;
  return false;
}

const NON_TEXT_INPUTS = ["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"];

/** Can the user type text into this element? (Drop-downs, checkboxes, buttons: no.) */
export function isTextEditable(tag: string, inputType: string | null, contentEditable: boolean): boolean {
  const t = tag.toLowerCase();
  if (contentEditable) return true;
  if (t === "textarea") return true;
  if (t === "input") return !NON_TEXT_INPUTS.includes((inputType ?? "text").toLowerCase());
  return false;
}

export type ContextTarget = {
  /** The click landed in a text field or the editor. */
  editable: boolean;
  /** Some text is selected on the page. */
  hasSelection: boolean;
};

/**
 * Keep the engine's menu only where it is useful: in text you can edit (cut /
 * copy / paste, spelling suggestions) or over a selection (copy). Everywhere
 * else it only offers Refresh, Back, Save as…, so it is suppressed.
 */
export function allowNativeContextMenu(t: ContextTarget): boolean {
  return t.editable || t.hasSelection;
}
