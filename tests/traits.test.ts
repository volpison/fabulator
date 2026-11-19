import { test } from "node:test";
import assert from "node:assert/strict";
import { stringToTraits, traitsToString } from "../src/lib/model/traits.ts";

test("a list of traits is written as comma-separated text", () => {
  assert.equal(traitsToString(["brave", "stubborn"]), "brave, stubborn");
  assert.equal(traitsToString([]), "");
});

test("comma-separated text is read back as a list: trimmed, no empty items", () => {
  assert.deepEqual(stringToTraits(" brave ,stubborn,, "), ["brave", "stubborn"]);
  assert.deepEqual(stringToTraits(""), []);
});

test("writing then reading a list gives the same list", () => {
  const list = ["a", "b c", "d"];
  assert.deepEqual(stringToTraits(traitsToString(list)), list);
});
