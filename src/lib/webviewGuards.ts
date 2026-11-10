/** Attach the browser-engine guards (see guards.ts) and protect unsaved work from a reload. */
import { get } from "svelte/store";
import { isDirty } from "./stores";
import { allowNativeContextMenu, isBlockedBrowserKey, isTextEditable } from "./guards";

const EDITABLE = 'input, textarea, [contenteditable=""], [contenteditable="true"]';

function isEditableTarget(target: Element | null): boolean {
  const el = target?.closest(EDITABLE);
  if (!el) return false;
  return isTextEditable(el.tagName, el.getAttribute("type"), el.hasAttribute("contenteditable"));
}

export function installWebviewGuards(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (isBlockedBrowserKey(e)) e.preventDefault();
  };

  const onContextMenu = (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const editable = isEditableTarget(target);
    const hasSelection = (window.getSelection()?.toString() ?? "") !== "";
    if (!allowNativeContextMenu({ editable, hasSelection })) e.preventDefault();
  };

  // Dropping a file on the window would make the engine open it and replace the app.
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
  const stopFileNavigation = (e: DragEvent) => {
    if (hasFiles(e)) e.preventDefault();
  };

  // Last line of defence: if something still reloads the page (a script, a dev-server
  // refresh), ask first while there are unsaved changes.
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (get(isDirty)) {
      e.preventDefault();
      e.returnValue = "";
    }
  };

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("contextmenu", onContextMenu, true);
  window.addEventListener("dragover", stopFileNavigation);
  window.addEventListener("drop", stopFileNavigation);
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("contextmenu", onContextMenu, true);
    window.removeEventListener("dragover", stopFileNavigation);
    window.removeEventListener("drop", stopFileNavigation);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}
