# Tests

How the project is tested, and what CI checks.

## Running the tests

```bash
npm test                                   # the TypeScript tests (Node's built-in test runner, no extra packages)
cargo test --manifest-path src-tauri/Cargo.toml   # the Rust tests (this also compiles the whole Tauri backend)
npm run check                              # Svelte and TypeScript type check
npm run build                              # builds the front end
```

## What the TypeScript tests cover

There is one file per area in `tests/`:

- **Pure rules:** the model, migration, search, replace, snapshots, word counts and goals, story time, plotlines, patches, labels and filters.
- **Each story format:** `comic*.test.ts` and `screenplay*.test.ts` cover data, edit operations, exports, shared tools and reports.
- **Exports:** the writers (Word, EPUB, Markdown, text, PDF, Fountain, scripts, thumbnails), including a check that the PDF has a valid structure.
- **Persistence flows:** `persistence.test.ts` runs start-up, save, open, recovery and folder flows against `tests/fakePlatform.ts`, an in-memory pretend disk with scripted dialog answers.
- **Themes:** the theme file format, the generator (contrast), VS Code and Base16 import, the gallery.
- **Release and docs:** `version.test.ts` (the version is equal in five files) and `docs-links.test.ts` (every link in the README, roadmap and `docs/` resolves, and the index lists every page).

Svelte components are not unit-tested: they stay thin, and the rules they call are. They are checked by the build, by `npm run check` and by running the app (`npm run tauri dev`).

## What CI does

`.github/workflows/ci.yml` runs on every push to `main` and every pull request, on a clean **Windows** machine (the platform Fabulator targets): install, `npm test`, `npm run build`, then `cargo test`. `npm run check` also runs but is informational for now (it cannot fail the build).

Testing on the real target matters: a docs test once failed only on Windows because of backslashes in paths.

## Writing a test

- New pure rule: add a test in the matching `tests/*.test.ts` (or a new file named after the module).
- New format field: also add a migration test (an older file still opens and is repaired).
- Compare paths with forward slashes; do not assume the machine's separator.
