// The app's version lives in five places. This keeps them equal and checks a release tag.
//
//   npm run version:set 0.2.0     change all of them
//   npm run version:check v0.2.0  fail unless the tag matches them (the release workflow runs this)
//
// The functions are exported (and tested in tests/version.test.ts); the command line is at the bottom.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const FILES = {
  package: "package.json",
  packageLock: "package-lock.json",
  tauri: "src-tauri/tauri.conf.json",
  cargo: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
};

export const isVersion = (v) => typeof v === "string" && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v);

const CARGO_VERSION = /(\[package\][^[]*?^version\s*=\s*)"([^"]+)"/ms;
const LOCK_VERSION = /(\[\[package\]\]\s*name = "fabulator"\s*version = )"([^"]+)"/;

/** Every place's version (null where a file or the field is missing). `read` gives a file's text, or null. */
export function readVersions(read) {
  const json = (f) => {
    const t = read(f);
    return t === null ? null : (JSON.parse(t).version ?? null);
  };
  const cargo = read(FILES.cargo);
  const lock = read(FILES.cargoLock);
  return {
    package: json(FILES.package),
    packageLock: json(FILES.packageLock),
    tauri: json(FILES.tauri),
    cargo: cargo === null ? null : (CARGO_VERSION.exec(cargo)?.[2] ?? null),
    cargoLock: lock === null ? null : (LOCK_VERSION.exec(lock)?.[2] ?? null),
  };
}

/** Problems with releasing `tag` (like "v0.2.0"): empty means fine. */
export function checkTag(tag, versions) {
  const problems = [];
  if (!/^v/.test(tag) || !isVersion(tag.slice(1))) {
    return [`The tag "${tag}" is not like v0.2.0.`];
  }
  const wanted = tag.slice(1);
  for (const [where, found] of Object.entries(versions)) {
    if (found === null) {
      if (where === "package" || where === "tauri" || where === "cargo") problems.push(`${FILES[where]}: no version found.`);
    } else if (found !== wanted) {
      problems.push(`${FILES[where]} says ${found}, but the tag is ${tag}.`);
    }
  }
  return problems;
}

/** Write `version` into every file that exists. `read` as above; `write(file, text)`. Returns the files changed. */
export function setVersions(version, read, write) {
  if (!isVersion(version)) throw new Error(`"${version}" is not a version like 0.2.0.`);
  const changed = [];
  const put = (f, text) => {
    write(f, text);
    changed.push(f);
  };
  for (const f of [FILES.package, FILES.tauri]) {
    const t = read(f);
    if (t === null) continue;
    put(f, t.replace(/("version"\s*:\s*)"[^"]+"/, `$1"${version}"`)); // the first one is the app's own
  }
  const lockJson = read(FILES.packageLock);
  if (lockJson !== null) {
    const data = JSON.parse(lockJson);
    data.version = version;
    if (data.packages?.[""]) data.packages[""].version = version;
    put(FILES.packageLock, JSON.stringify(data, null, 2) + "\n");
  }
  const cargo = read(FILES.cargo);
  if (cargo !== null) {
    if (!CARGO_VERSION.test(cargo)) throw new Error(`${FILES.cargo}: no version found.`);
    put(FILES.cargo, cargo.replace(CARGO_VERSION, `$1"${version}"`));
  }
  const lock = read(FILES.cargoLock);
  if (lock !== null && LOCK_VERSION.test(lock)) put(FILES.cargoLock, lock.replace(LOCK_VERSION, `$1"${version}"`));
  return changed;
}

const readFile = (f) => (existsSync(f) ? readFileSync(f, "utf8") : null);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, arg] = process.argv.slice(2);
  if (command === "check") {
    const versions = readVersions(readFile);
    const problems = checkTag(arg ?? "", versions);
    if (problems.length) {
      console.error(problems.join("\n"));
      console.error("\nChange them together with:  npm run version:set <x.y.z>");
      process.exit(1);
    }
    console.log(`All versions match ${arg}.`);
  } else if (command === "set") {
    try {
      const changed = setVersions(arg ?? "", readFile, (f, t) => writeFileSync(f, t));
      console.log(`Version ${arg} written to:\n  ${changed.join("\n  ")}`);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  } else {
    console.error("Usage: node scripts/version.mjs set <x.y.z> | check <vX.Y.Z>");
    process.exit(1);
  }
}
