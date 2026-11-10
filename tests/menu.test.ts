import { test } from "node:test";
import assert from "node:assert/strict";
import { formatShortcut, actionableIndexes, stepIndex } from "../src/lib/menu.ts";

test("shortcuts: unchanged elsewhere, symbols on macOS", () => {
  assert.equal(formatShortcut("Ctrl+Shift+S", false), "Ctrl+Shift+S");
  assert.equal(formatShortcut("Ctrl+Shift+S", true), "⌘⇧S");
  assert.equal(formatShortcut("Ctrl+O", true), "⌘O");
});

test("actionable items skip separators and disabled ones", () => {
  assert.deepEqual(
    actionableIndexes([{ label: "a" }, { separator: true }, { label: "b", disabled: true }, { label: "c" }]),
    [0, 3]
  );
  assert.deepEqual(actionableIndexes([]), []);
});

test("stepIndex wraps and starts from the right end", () => {
  assert.equal(stepIndex(-1, 3, 1), 0);
  assert.equal(stepIndex(-1, 3, -1), 2);
  assert.equal(stepIndex(2, 3, 1), 0);
  assert.equal(stepIndex(0, 3, -1), 2);
  assert.equal(stepIndex(1, 3, 1), 2);
  assert.equal(stepIndex(0, 0, 1), -1);
});

test("hasChildren is true only for non-empty submenus", async () => {
  const { hasChildren } = await import("../src/lib/menu.ts");
  assert.equal(hasChildren({ label: "a" }), false);
  assert.equal(hasChildren({ label: "a", children: [] }), false);
  assert.equal(hasChildren({ label: "a", children: [{ label: "b" }] }), true);
});
