import { test } from "node:test";
import assert from "node:assert/strict";
import { typewriterScrollTop, typewriterBottomPadding, TYPEWRITER_POSITION } from "../src/lib/typewriter.ts";
import { sanitizeSettings, DEFAULT_SETTINGS, cssVarsFor } from "../src/lib/settings.ts";

const view = { viewTop: 100, viewHeight: 600, scrollTop: 0 };

test("a cursor below the wanted height scrolls the text up to it", () => {
  // Wanted: 100 + 300 = 400 (centre). The line is at 500..520, middle 510 → move 110 down the page.
  assert.equal(typewriterScrollTop({ ...view, caretTop: 500, caretBottom: 520 }, "center"), 110);
});

test("a cursor above the wanted height scrolls back up, but never below zero", () => {
  assert.equal(typewriterScrollTop({ ...view, scrollTop: 500, caretTop: 190, caretBottom: 210 }, "center"), 300);
  assert.equal(typewriterScrollTop({ ...view, scrollTop: 20, caretTop: 110, caretBottom: 130 }, "center"), 0);
});

test("already at the wanted height (within a pixel): nothing to do", () => {
  assert.equal(typewriterScrollTop({ ...view, caretTop: 390, caretBottom: 410 }, "center"), null);
  assert.equal(typewriterScrollTop({ ...view, caretTop: 390, caretBottom: 410.8 }, "center"), null);
});

test("upper third keeps the line higher than the centre", () => {
  const line = { ...view, caretTop: 500, caretBottom: 520 };
  const center = typewriterScrollTop(line, "center")!;
  const upper = typewriterScrollTop(line, "upper")!;
  assert.ok(upper > center);
  assert.equal(upper, Math.round(0 + 510 - 100 - 600 * TYPEWRITER_POSITION.upper));
});

test("unusable measurements never move anything", () => {
  assert.equal(typewriterScrollTop({ ...view, caretTop: NaN, caretBottom: 520 }, "center"), null);
  assert.equal(typewriterScrollTop({ ...view, viewHeight: 0, caretTop: 500, caretBottom: 520 }, "center"), null);
});

test("the room under the text matches the wanted height", () => {
  assert.equal(typewriterBottomPadding(600, "center"), 300);
  assert.equal(typewriterBottomPadding(600, "upper"), Math.round(600 * 0.67));
  assert.equal(typewriterBottomPadding(600, "off"), 0);
  assert.equal(typewriterBottomPadding(0, "center"), 0);
  assert.equal(typewriterBottomPadding(NaN, "center"), 0);
});

test("old saved settings get the new options off; junk falls back to the defaults", () => {
  const old = sanitizeSettings({ theme: "dark", editorSize: 20 });
  assert.equal(old.typewriter, "off");
  assert.equal(old.dimOthers, false);
  assert.equal(old.editorSize, 20);
  const set = sanitizeSettings({ typewriter: "upper", dimOthers: true });
  assert.equal(set.typewriter, "upper");
  assert.equal(set.dimOthers, true);
  const junk = sanitizeSettings({ typewriter: "sideways", dimOthers: "yes" });
  assert.equal(junk.typewriter, DEFAULT_SETTINGS.typewriter);
  assert.equal(junk.dimOthers, DEFAULT_SETTINGS.dimOthers);
});

test("the new options are behaviour, not CSS: they add no style variables", () => {
  const a = cssVarsFor(DEFAULT_SETTINGS, false);
  const b = cssVarsFor({ ...DEFAULT_SETTINGS, typewriter: "center", dimOthers: true }, false);
  assert.deepEqual(a, b);
});
