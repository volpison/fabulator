// Writes a small valid project file, used by the Android emulator check to try the real file picker.
//   node --experimental-strip-types --no-warnings --import ./tests/register.mjs scripts/make-sample-project.ts out.fabulator.json
import { writeFileSync } from "node:fs";
import { blankProject } from "../src/lib/blank.ts";

let n = 0;
const project = { ...blankProject((prefix: string) => `${prefix}-${++n}`), title: "Imported from the device" };
const out = process.argv[2];
if (!out) throw new Error("usage: make-sample-project.ts <output file>");
writeFileSync(out, JSON.stringify(project, null, 2));
console.log(`wrote ${out}`);
