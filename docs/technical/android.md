# Design: Android port

Status: **proposal, step 2 in progress** (capabilities and the APK workflow are in; nothing else yet). Decided with the author: **tablet first**, first milestone **write and read**, tested on a **real device** with a debug APK built by CI.

## What the first milestone is

Open, write and save a project on an Android tablet: the writing view, Cast and the other shared notes, the Timeline, autosave, crash recovery and backups. Not in it: exports, Check & playtest, find & replace, snapshots UI polish, the Markdown folder. They stay reachable only if they already work; anything that does not is hidden, not broken (the project rule: an unfinished feature says so or is not offered).

Phones come after, on the same code, once the tablet layout is sound.

## What is already in place

- Tauri 2 supports Android; `src-tauri` is already a library crate with `crate-type = ["staticlib", "cdylib", "rlib"]` and a `mobile_entry_point`.
- **All machine access is behind the `Platform` interface**, and a `Location` is opaque to the app. The editor, Timeline and save logic need no change for a different file backend.
- Crash recovery, backups' bookkeeping and imported themes already live under the app's own data directory (`app_data_dir`), which exists on Android.

## The main problem: files on Android

The dialog plugin returns a **content URI** (`content://…`) on Android, not a path. Rust's `std::fs` cannot open one, and a content URI has no sibling files, so the atomic write (temp file, then rename) and the backups next to the project file cannot work on it.

Options:

| | A. Private working copy (proposed) | B. Direct access to the picked file |
|---|---|---|
| How | The project lives in the app's private storage. **Open…** copies the picked file in; **Save a copy…** writes out through the picker. | Read and write the picked URI each time. |
| Atomic save, backups, recovery | Unchanged: they work on real paths. | Must be rebuilt for URIs; no rename, so a crash mid-write can leave a half file. |
| What the person sees | Two copies of a story exist; they must understand "import" and "save a copy". | One file, as on desktop. |
| Risk | Low; fits the existing Rust code. | Higher; data-loss risks are exactly what the format rules exist to prevent. |

**Proposal: A for the first milestone**, with plain wording ("Open a copy from your device", "Save a copy to your device") and a visible "last saved a copy" note so work is not stranded in private storage. B (or a chosen folder kept in sync) can come later, behind the same `Platform` interface.

On A the Android `Location` is an ordinary path inside the app's data directory, so `openProject`, `saveProject` and the recovery store need **no Rust change**. New: two platform methods' worth of behaviour: *import* (read a picked URI, write it into private storage) and *export a copy* (`writeBytes` to a picked URI). Reading and writing URIs needs the Tauri file-system plugin (to be confirmed against its current Android support when step 2 begins).

## Other differences

- **No window close.** `onCloseRequested` has no Android equivalent. The app is paused or killed by the system, so the unsaved copy must be written when the page becomes hidden (`visibilitychange`), not at close. The recovery rules stay the same.
- **Touch, no hover, soft keyboard.** Menus that rely on hover, small targets, drag and drop with the mouse (Timeline reordering) and keyboard shortcuts need touch equivalents. Layout must survive the keyboard shrinking the screen.
- **Editor.** Tiptap runs in the Android WebView; text input (IME composition, predictive text) is the thing to test first on the real device.
- **Capabilities.** The `Platform` interface gains a small `capabilities` object (can pick folders, has window close, can write exports) so the UI hides what a platform cannot do, instead of platform checks scattered in components.
- **Packaging.** `tauri android init` generates an Android Studio project (`src-tauri/gen/android`). A CI job on Ubuntu (Android SDK/NDK, Rust Android targets) builds a **debug APK** and attaches it to the run as a downloadable file. Signed release builds and Play Store publishing are out of scope for now.

## Steps (each its own pull request)

1. **This design** (docs only).
2. **Platform capabilities and the Android project:** a `capabilities` object (desktop unchanged), hide features by capability, `tauri android init`, and the CI job that builds a debug APK. *You install the APK; nothing else is expected to work yet.*
3. **Android Platform:** import and save-a-copy through pickers, the pause hook, app wording. *First real test: open, edit, save, kill the app, recover.*
4. **Tablet layout:** touch targets, no-hover menus, Timeline touch interaction, soft keyboard. Iterated with your device feedback.
5. **Docs and polish:** the user guide's Android section, known limits, roadmap update.

## Honest limits of working on it here

- Neither Cargo nor the Android toolchain can be run in the authoring environment, so **CI and your device are the only build checks**. Every pull request will say what was and was not built.
- Touch behaviour and the editor on Android cannot be judged without the device: expect a few rounds of feedback in step 4.

## Questions to settle

- Is a private working copy (option A) acceptable for the first milestone?
- `src-tauri/gen/android`: generate it in CI each run (nothing to maintain, harder to customise) or commit it (needed once the manifest or Gradle needs changes)? Proposal: generate in CI for step 2, commit it when step 3 or 4 needs a change.

## Step 2: what is in

- `src/lib/platform/capabilities.ts`: `folders` and `windowClose`, chosen from the user-agent (an Android WebView says "Android"). Desktop is unchanged. The File menu hides *Open folder…* and *Export as folder (Markdown)…*, and the theme dialog hides *Import folder…*, where `folders` is false. `onCloseRequested` does nothing without `windowClose`; the existing page-hide autosave covers a paused app.
- `.github/workflows/android.yml`: builds a debug APK for 64-bit ARM on request (Actions → **Android APK** → Run workflow) and attaches it to the run. It creates the Android project each time (`tauri android init`), as proposed.
- Decided by merging this page without objection: option A (private working copy) and generate-in-CI.

## Step 3: what is in

- **Rust** (`src-tauri/src/commands/device.rs`): `import_project_copy` reads a picked file (a `content://` address, opened with the file-system plugin's `open`) and writes a copy into `<app data>/projects/` under a free name made from the story title; `new_project_path` gives a free private name for a new story; `export_project_copy` writes a saved project to a picked address. `write_export` and `read_text_file` now accept content addresses too, so exports and theme-file imports work from the pickers. Name logic (`storage/names.rs`) is plain Rust with unit tests.
- **Platform** gains `adoptProject`, `pickProjectSavePath` and `saveCopyToDevice`, and the capability `deviceCopies`. Desktop: adopt returns the same location, the save path is a save dialog, nothing else changes.
- **Menu on Android:** *Save as…* is replaced by *Save a copy to your device…*, which saves inside the app first so the copy is current. *Open…* copies the picked file in; opening the same file twice makes a second copy named `… (2)`.
- Everything after the copy (atomic saves, backups, crash recovery, recent files) is the unchanged desktop code working on ordinary paths.
- Unverified until it runs on a device: that the plugin can open the addresses the picker returns (read and write), and that the picker lets a new file be created and overwritten.

## Step 4 (in progress): tablet layout

- **Safe areas** (done, checked in the CI emulator): the app is drawn under Android's status and navigation bars, so on Android `<html>` gets the class `android` and the page keeps clear of them: `env(safe-area-inset-*)` where the web view reports it, with floors (28px top; 24px bottom, 64px bottom on a tablet) for older web views that report 0. `viewport-fit=cover` is set.
- **How it is checked without a tablet:** *Actions → Android emulator check → Run workflow* boots a tablet emulator, opens the app, and saves a screenshot and the text on screen (in the job log). The screenshot is also pushed to the throwaway branch `ci-emulator`.
- **Touch menus** (done, checked in the emulator): on Android, menu rows are at least 44px tall and keyboard-shortcut hints (Ctrl+N…) are hidden; the status line says "Unsaved — choose File → Save to keep it" instead of naming Ctrl+S.
- **The on-screen keyboard** (done, checked in the emulator). Android's edge-to-edge drawing stops the keyboard from resizing the page, so the keyboard covered the lower half of the writing area. `scripts/android-patch.sh` (run in CI right after `tauri android init`) adds a small listener to the generated `MainActivity.kt` that pads the page by the keyboard's height. The page then really shrinks, `src/lib/keyboard.ts` notices (`<html class="keyboard">`) and the novel writing view folds away the synopsis, labels and links so the text gets the room. Because the Android project is generated, this patch is the only place such native changes live; if the Tauri template changes, the script prints the file before and after so a mismatch is easy to see.
- **A flaky emulator:** the emulator image with Google services let Google Play services crash and take the app with it ("depends on provider … in dying proc"), so the check uses the plain image (`target: default`).
- **Timeline by touch** (done, checked in the emulator). HTML5 drag and drop does **not** work with a finger in the Android web view (a long-press drag of a scene card did nothing). So: controls that only appear on hover (a card's *Edit* label, the *+* in a cell, a chapter's ◄ ► ✕, the game writing view's element tools) are shown on touch screens (`@media (hover: none)`); the scene's Edit mode, which already had *Chapter* and *Plotline* choices, gained **▲ ▼** to move the scene within its cell. Moving to another chapter or plotline therefore works without dragging; chapters are moved with ◄ ►. The Manuscript scene list and the comic, screenplay and game lists are still reordered by dragging only.
- Still to do: touch alternatives for dragging in the other lists, the other writing views (comic, screenplay, game) folding on the keyboard, and a real device.

## Checked with the real Android file picker (emulator)

The emulator check drives the system file picker (the platform's `DocumentsUI`) with uiautomator:

- **Open…** — a project file pushed to the emulator's *Downloads* is chosen in the picker; the app copies it into its private folder and opens the copy (status line shows the story and its private file name). This exercises `import_project_copy` with a real `content://` address.
- **Save a copy to your device…** — the save dialog opens with the story's name filled in; pressing **SAVE** writes the file into *Downloads* through `export_project_copy`, the app shows "A copy was saved to your device…", and the written file contains the story (title and `schema_version`).

Still not covered: the picker on a real device and other file providers (cloud drives, SD cards), very large files, and cancelling inside the picker.
