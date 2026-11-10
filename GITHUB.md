# Putting Fabulator on GitHub (and what the CI does)

## One-time setup

1. On github.com (logged in as volpison): **New repository** → name `fabulator`, leave it empty (no README, no .gitignore, no licence).
2. In a terminal inside the project folder:

   ```
   git init -b main
   git add .
   git commit -m "Fabulator v28"
   git remote add origin https://github.com/volpison/fabulator.git
   git push -u origin main
   ```

   (First run `npm install` and a Tauri build/dev once so `package-lock.json` and `src-tauri/Cargo.lock` exist, and commit both: they pin the exact dependency versions.)

## What the CI is

A *workflow* is a recipe in `.github/workflows/` that GitHub runs on its own computers.

- **CI** (`ci.yml`): runs by itself on every push. It installs everything on a clean Windows machine, runs the tests, builds the front end and compiles + tests the Rust side. Open the **Actions** tab on GitHub to see a green ✓ or a red ✗; click a red one to read the error.
- **Release** (`release.yml`): builds the Windows installer when you create a version tag:

  ```
  git tag v0.2.0
  git push origin v0.2.0
  ```

  After ~10 minutes a **draft release** appears under *Releases* with the installer attached. Check it, then press **Publish**.

You never have to run the CI yourself.

## Everyday workflow

```
git add .
git commit -m "What changed"
git push
```
