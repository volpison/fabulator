import { test } from "node:test";
import assert from "node:assert/strict";
import { keyboardOpen } from "../src/lib/keyboard.ts";

test("a page that lost about half its height has the keyboard open", () => {
  assert.equal(keyboardOpen(400, 800), true);
});

test("a small change (a bar appearing) is not the keyboard", () => {
  assert.equal(keyboardOpen(740, 800), false);
});

test("no height known yet is not the keyboard", () => {
  assert.equal(keyboardOpen(0, 0), false);
});
