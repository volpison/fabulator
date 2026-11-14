# Contributing

How changes are made to Fabulator, what CI does, and how a release is made.

## The workflow

- Work happens on a branch, never directly on `main`. Branch names that Claude creates start with `claude/`.
- Each change is a **pull request** with one topic. The description says what changed and what to check before merging.
- CI must be green (a ✓ in the pull request) before merging.
- A change that moves code without changing behaviour (a refactor) goes in its own pull request, separate from any behaviour change.
- Commit messages say what changed and why, in plain words.

Everyday steps:

```
git checkout -b my-change
git add .
git commit -m "What changed"
git push -u origin my-change
```

then open a pull request on GitHub.

## What the CI is

A *workflow* is a recipe in `.github/workflows/` that GitHub runs on its own computers.

- **CI** (`ci.yml`): runs by itself on every push to `main` and every pull request. It installs everything on a clean Windows machine, runs the tests, builds the front end and compiles and tests the Rust side. Open the **Actions** tab on GitHub to see a green ✓ or a red ✗; click a red one to read the error. See [Tests](technical/testing.md).
- **Release** (`release.yml`): builds the Windows installer when a version tag is pushed. First it checks that the tag matches the app's version and runs the tests; then it builds, and a **draft release** appears under *Releases* with the installers attached (about 10 minutes). Check it, then press **Publish**.

You never have to run the CI yourself.

## Making a release

1. Choose the number (`0.2.0`: new features raise the middle number, only fixes raise the last one) and change it everywhere at once:

   ```
   npm run version:set 0.2.0
   ```

   (It updates `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `Cargo.toml` and `Cargo.lock`.)
2. Send that change as a pull request, wait for the green ✓, and merge it.
3. On your computer, update `main` and tag it:

   ```
   git checkout main
   git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. Open **Actions** to watch the *Release* run. If its first step fails, the tag and the version disagree: delete the tag (`git push --delete origin v0.2.0` and `git tag -d v0.2.0`), fix the version, and tag again.
5. Under **Releases**, open the draft, write what is new, attach nothing else, and press **Publish** (or leave it as a draft, if you do not publish binaries).

The installer is not code-signed (that needs a paid certificate), so Windows SmartScreen shows a warning the first time: *More info → Run anyway*.

## One-time setup of the repository

1. On github.com: **New repository** → name `fabulator`, leave it empty (no README, no .gitignore, no licence).
2. In a terminal inside the project folder:

   ```
   git init -b main
   git add .
   git commit -m "First commit"
   git remote add origin https://github.com/volpison/fabulator.git
   git push -u origin main
   ```

   (First run `npm install` and a Tauri build/dev once so `package-lock.json` and `src-tauri/Cargo.lock` exist, and commit both: they pin the exact dependency versions.)

## Keeping the docs healthy

- A user-facing change updates the page in `docs/user-guide/`; a change to how the app is built or to the file format updates `docs/technical/`.
- A new page is added to [the index](index.md). `npm test` fails if a link or an index entry is broken.
- The README stays short: what it is, what you can do, how to run it, links.
