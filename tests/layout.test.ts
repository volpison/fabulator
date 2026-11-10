import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPanelWidth, PANEL_MIN, PANEL_MAX, PANEL_DEFAULT } from "../src/lib/layout.ts";

test("panel width is clamped to sensible limits", () => {
  assert.equal(clampPanelWidth(400), 400);
  assert.equal(clampPanelWidth(10), PANEL_MIN);
  assert.equal(clampPanelWidth(5000), PANEL_MAX);
  assert.equal(clampPanelWidth(399.6), 400);
});

test("junk falls back to the default; small windows cap the width", () => {
  for (const junk of [NaN, Infinity, "wide", null, undefined]) assert.equal(clampPanelWidth(junk), PANEL_DEFAULT);
  assert.equal(clampPanelWidth(700, 800), 480);   // 60% of 800
  assert.equal(clampPanelWidth(700, 300), PANEL_MIN); // never below the minimum
});
