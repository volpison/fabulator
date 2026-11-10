import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlockedBrowserKey, allowNativeContextMenu, isTextEditable } from "../src/lib/guards.ts";

const k = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

test("reload shortcuts are blocked", () => {
  assert.equal(isBlockedBrowserKey(k("F5")), true);
  assert.equal(isBlockedBrowserKey(k("F5", { ctrlKey: true })), true);
  assert.equal(isBlockedBrowserKey(k("r", { ctrlKey: true })), true);
  assert.equal(isBlockedBrowserKey(k("R", { ctrlKey: true, shiftKey: true })), true);
  assert.equal(isBlockedBrowserKey(k("r", { metaKey: true })), true);
  assert.equal(isBlockedBrowserKey(k("BrowserRefresh")), true);
});

test("print, view-source, caret browsing and history navigation are blocked", () => {
  assert.equal(isBlockedBrowserKey(k("p", { ctrlKey: true })), true);
  assert.equal(isBlockedBrowserKey(k("u", { ctrlKey: true })), true);
  assert.equal(isBlockedBrowserKey(k("F7")), true);
  assert.equal(isBlockedBrowserKey(k("ArrowLeft", { altKey: true })), true);
  assert.equal(isBlockedBrowserKey(k("ArrowRight", { altKey: true })), true);
});

test("the app's own shortcuts and normal typing pass through", () => {
  for (const e of [
    k("r"), k("a", { ctrlKey: true }), k("s", { ctrlKey: true }), k("h", { ctrlKey: true }), k("f", { ctrlKey: true, shiftKey: true }),
    k("ArrowUp", { altKey: true }), k("ArrowDown", { altKey: true }), k("ArrowLeft"), k("\\", { ctrlKey: true }),
    k("I", { ctrlKey: true, shiftKey: true }), k("F12"), k("ArrowLeft", { altKey: true, ctrlKey: true }),
  ]) assert.equal(isBlockedBrowserKey(e), false, JSON.stringify(e));
});

test("the engine's context menu stays only for editable text or a selection", () => {
  assert.equal(allowNativeContextMenu({ editable: true, hasSelection: false }), true);
  assert.equal(allowNativeContextMenu({ editable: false, hasSelection: true }), true);
  assert.equal(allowNativeContextMenu({ editable: false, hasSelection: false }), false);
});

test("only real text inputs count as editable (not drop-downs, checkboxes, buttons)", () => {
  assert.equal(isTextEditable("TEXTAREA", null, false), true);
  assert.equal(isTextEditable("INPUT", null, false), true);
  assert.equal(isTextEditable("input", "text", false), true);
  assert.equal(isTextEditable("input", "search", false), true);
  assert.equal(isTextEditable("input", "number", false), true);
  for (const type of ["checkbox", "radio", "range", "button", "color", "file"]) assert.equal(isTextEditable("input", type, false), false, type);
  assert.equal(isTextEditable("SELECT", null, false), false);
  assert.equal(isTextEditable("DIV", null, true), true);
  assert.equal(isTextEditable("DIV", null, false), false);
});

test("Ctrl+N / Ctrl+T / Ctrl+Shift+N are kept from the browser engine (new window or tab)", () => {
  const k = (key: string, shiftKey = false) => ({ key, ctrlKey: true, metaKey: false, altKey: false, shiftKey });
  assert.equal(isBlockedBrowserKey(k("n")), true);
  assert.equal(isBlockedBrowserKey(k("N", true)), true);
  assert.equal(isBlockedBrowserKey(k("t")), true);
  assert.equal(isBlockedBrowserKey({ key: "n", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }), false);
});
