import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCapabilities } from "../src/lib/platform/capabilities.ts";

test("desktop user agents get folders and window close", () => {
  const c = detectCapabilities("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");
  assert.deepEqual(c, { folders: true, windowClose: true });
});

test("an Android WebView gets neither", () => {
  const c = detectCapabilities("Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/120 Safari/537.36");
  assert.deepEqual(c, { folders: false, windowClose: false });
});

test("an empty user agent counts as desktop (tests, server-side)", () => {
  assert.equal(detectCapabilities("").folders, true);
});
