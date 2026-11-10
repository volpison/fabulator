import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLOTLINE_COLORS, addPlotline, cleanPlotlineColor, movePlotlineBy, nextPlotlineColor, removePlotline, updatePlotlineIn,
} from "../src/lib/plotlines.ts";

const pls = () => [
  { id: "a", name: "Main", color: "#3b82f6" },
  { id: "b", name: "Romance", color: "#ef4444" },
];
const sc = (id: string, pl: string) => ({ id, plotline_id: pl }) as any;

test("a new plotline gets a default name and a colour nobody uses", () => {
  const out = addPlotline(pls(), "c");
  assert.equal(out.length, 3);
  assert.equal(out[2].name, "Plotline 3");
  assert.ok(!["#3b82f6", "#ef4444"].includes(out[2].color));
  assert.equal(addPlotline(pls(), "c", "  Mystery ")[2].name, "Mystery");
});

test("colours cycle once the palette is used up", () => {
  const all = PLOTLINE_COLORS.map((c) => ({ color: c }));
  assert.ok(PLOTLINE_COLORS.includes(nextPlotlineColor(all) as any));
});

test("rename and recolour; blank names and bad colours are ignored", () => {
  const out = updatePlotlineIn(pls(), "a", { name: " Heist ", color: "#ABCDEF" });
  assert.deepEqual(out[0], { id: "a", name: "Heist", color: "#abcdef" });
  const same = pls();
  assert.equal(updatePlotlineIn(same, "a", { name: "  ", color: "red" }), same);
  assert.equal(cleanPlotlineColor("#12345"), null);
});

test("deleting moves its scenes; the last plotline is protected", () => {
  const r = removePlotline(pls(), [sc("1", "a"), sc("2", "b")], "b")!;
  assert.equal(r.plotlines.length, 1);
  assert.deepEqual(r.scenes.map((s) => s.plotline_id), ["a", "a"]);
  assert.equal(removePlotline(r.plotlines, r.scenes, "a"), null);
  assert.equal(removePlotline(pls(), [], "zzz"), null);
  const three = addPlotline(pls(), "c");
  const t = removePlotline(three, [sc("1", "a")], "a", "c")!;
  assert.equal(t.scenes[0].plotline_id, "c");
});

test("reordering lanes", () => {
  assert.deepEqual(movePlotlineBy(pls(), "b", -1).map((p) => p.id), ["b", "a"]);
  const p = pls();
  assert.equal(movePlotlineBy(p, "a", -1), p);
});
