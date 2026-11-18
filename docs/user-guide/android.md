# Fabulator on an Android tablet (preview)

Fabulator runs on Android tablets as a **preview**. You can write, plan on the Timeline, keep your world notes, and open and save stories, in every mode. It has been tried in a tablet emulator, not yet on a real tablet, so expect rough edges and please report them.

## Install

The preview is a *debug build* made by GitHub. It is not on any app store and is not signed for release.

1. In the project on GitHub, open **Actions → Android APK → Run workflow** (choose the branch `main`), and wait until the run turns green.
2. Open the finished run and download **fabulator-debug-apk** (a zip file). Unzip it: inside is the `.apk`.
3. Copy the `.apk` to the tablet and open it. Android asks you to allow installing from that source (your browser or file manager); allow it for this one install.

It is built for 64-bit ARM devices, which is nearly every tablet and phone made in recent years.

## Where your stories live

Fabulator keeps your stories **inside the app**, so that autosave, backups and crash recovery work exactly as on a computer.

- **File → Open…** opens the system file chooser. The file you pick is **copied** into the app and the copy is opened; your original is not touched. Opening the same file twice gives two copies (the second is named “… (2)”).
- **File → Save** keeps your story inside the app. A new story is given a name from its title the first time.
- **File → Save a copy to your device…** saves your story and then writes a copy to a place you choose (for example *Downloads*), so it is not stranded inside the app. Do this when you finish for the day, and whenever you want a copy for the computer.
- There is no *Save as…* and no *Open folder* / *Export as folder*; those need a different file model.

## Writing

- Tap a scene on the Timeline to write in the **Manuscript**. When the on-screen keyboard opens, the page rises above it and the scene's synopsis and labels fold away to leave room to write; they come back when the keyboard closes.
- Menus have no keyboard-shortcut hints. Everything is reachable from the menus and buttons.

## Moving things

A finger cannot drag in the Android web view, so:

- To move a **scene**, tap **Edit** on its card: choose another chapter or plotline from the lists, or use ▲ ▼ to move it up or down. Chapters have ◄ ► buttons in their header.
- Controls that on a computer appear when you point at them (a card's *Edit*, the *+* in an empty cell, a chapter's ◄ ► ✕) are always visible.

## What is not there yet

- **Dragging** is still the only way to reorder the Manuscript's scene list, and the comic, screenplay and game lists.
- The comic, screenplay and game writing views do not fold their headers away when the keyboard opens (they rise above it, though).
- **Phones:** the layout is for tablets. A phone shows the same screens, cramped.
- **Export** and the other tools use the system file chooser too, but have not been tried on a device.

See [Safety, backups and recovery](safety-and-backups.md) for how your work is protected, and the [technical notes](../technical/android.md) for how it works.
