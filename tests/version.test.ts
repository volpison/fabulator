import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FILES, isVersion, readVersions, checkTag, setVersions } from "../scripts/version.mjs";

/** An in-memory copy of the project's real version files. */
function disk() {
  const files = new Map<string, string>();
  for (const f of Object.values(FILES as Record<string, string>)) {
    try { files.set(f, readFileSync(f, "utf8")); } catch { /* optional */ }
  }
  return {
    files,
    read: (f: string) => files.get(f) ?? null,
    write: (f: string, t: string) => void files.set(f, t),
  };
}

test("versions look like 1.2.3, optionally with a suffix", () => {
  for (const ok of ["0.1.0", "1.20.3", "2.0.0-beta.1"]) assert.ok(isVersion(ok), ok);
  for (const bad of ["1.2", "v1.2.3", "1.2.3.4", "", "latest", 5 as never]) assert.ok(!isVersion(bad), String(bad));
});

test("the real project files agree with each other", () => {
  const { read } = disk();
  const v = readVersions(read);
  assert.ok(v.package && v.tauri && v.cargo, JSON.stringify(v));
  assert.deepEqual(checkTag(`v${v.package}`, v), []);
});

test("a tag that does not match, or is not a version, is refused with a reason", () => {
  const { read } = disk();
  const v = readVersions(read);
  const problems = checkTag("v9.9.9", v);
  assert.ok(problems.length >= 3);
  assert.match(problems[0], /says .*, but the tag is v9\.9\.9/);
  assert.equal(checkTag("0.1.0", v).length, 1); // missing the v
  assert.equal(checkTag("release", v).length, 1);
});

test("setting a version changes every file and leaves the rest of them alone", () => {
  const d = disk();
  const before = new Map(d.files);
  const changed = setVersions("0.2.0", d.read, d.write);
  assert.ok(changed.length >= 3);
  const after = readVersions(d.read);
  for (const [where, v] of Object.entries(after)) if (v !== null) assert.equal(v, "0.2.0", where);
  assert.deepEqual(checkTag("v0.2.0", after), []);

  // Only the version lines differ.
  for (const [f, text] of d.files) {
    const a = before.get(f)!.split("\n");
    const b = text.split("\n");
    assert.equal(a.length, b.length, f);
    const differing = a.filter((line, i) => line !== b[i]);
    assert.ok(differing.length <= 2, `${f}: ${differing.length} lines changed`);
    for (const line of differing) assert.match(line, /version/i, f);
  }
});

test("a dependency's own version is never touched", () => {
  const d = disk();
  const lockBefore = d.files.get(FILES.cargoLock);
  setVersions("3.4.5", d.read, d.write);
  if (lockBefore) {
    const count = (t: string) => (t.match(/^version = /gm) ?? []).length;
    assert.equal(count(d.files.get(FILES.cargoLock)!), count(lockBefore));
    assert.equal((d.files.get(FILES.cargoLock)!.match(/version = "3\.4\.5"/g) ?? []).length, 1);
  }
});

test("a bad version is refused before anything is written", () => {
  const d = disk();
  assert.throws(() => setVersions("0.2", d.read, () => assert.fail("wrote")), /not a version/);
});

test("Windows line endings survive: only the version lines change", () => {
  const d = disk();
  for (const [f, t] of d.files) d.files.set(f, t.replace(/\r?\n/g, "\r\n"));
  const before = new Map(d.files);
  setVersions("0.3.0", d.read, d.write);
  for (const [f, text] of d.files) {
    assert.equal(text.split("\n").length, before.get(f)!.split("\n").length, f);
    assert.ok(!/[^\r]\n/.test(text), `${f} lost its CRLF endings`);
    const changed = text.split("\n").filter((line, i) => line !== before.get(f)!.split("\n")[i]);
    assert.ok(changed.length <= 2, `${f}: ${changed.length} lines changed`);
  }
  assert.deepEqual(checkTag("v0.3.0", readVersions(d.read)), []);
});
