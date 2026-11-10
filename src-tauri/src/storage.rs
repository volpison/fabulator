//! Crash-safe file storage: atomic writes + rotating backups.
//!
//! Deliberately std-only so it can be unit-tested in isolation.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// How many backups to keep per project file.
pub const BACKUPS_TO_KEEP: usize = 20;
/// Autosaves only create a new backup if the newest one is older than this.
pub const BACKUP_MIN_INTERVAL_SECS: u64 = 300;

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Write `bytes` to `path` so that a crash or power loss can never leave a
/// half-written file: write to `<path>.tmp`, flush to disk, then rename over
/// the original (an atomic replace on the same filesystem).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = path.file_name().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "path has no file name")
    })?;

    let mut tmp_name = file_name.to_os_string();
    tmp_name.push(".tmp");
    let tmp = dir.join(tmp_name);

    let written: io::Result<()> = (|| {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        Ok(())
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }

    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(())
}

/// `story.fabulator.json` -> `story.fabulator.json.backups/`
pub fn backup_dir(path: &Path) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(".backups");
    path.with_file_name(name)
}

/// Existing backups as (path, unix_secs), oldest first.
fn list_backups(dir: &Path) -> io::Result<Vec<(PathBuf, u64)>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir)? {
        let p = entry?.path();
        if p.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Some(secs) = p
            .file_stem()
            .and_then(|s| s.to_str())
            .and_then(|s| s.parse::<u64>().ok())
        {
            out.push((p, secs));
        }
    }
    out.sort_by_key(|(_, secs)| *secs);
    Ok(out)
}

/// Copy the current on-disk file into the backups folder before it is
/// overwritten. Returns the backup path if one was made.
///
/// With `force == false` (autosave) a backup is skipped when the newest one is
/// younger than `BACKUP_MIN_INTERVAL_SECS`, so autosave doesn't flood the disk.
pub fn backup_existing(path: &Path, force: bool, now: u64) -> io::Result<Option<PathBuf>> {
    if !path.is_file() {
        return Ok(None);
    }
    let dir = backup_dir(path);
    fs::create_dir_all(&dir)?;

    if !force {
        if let Some((_, newest)) = list_backups(&dir)?.last() {
            if now.saturating_sub(*newest) < BACKUP_MIN_INTERVAL_SECS {
                return Ok(None);
            }
        }
    }

    let dest = dir.join(format!("{now:012}.json"));
    fs::copy(path, &dest)?;

    let backups = list_backups(&dir)?;
    if backups.len() > BACKUPS_TO_KEEP {
        for (old, _) in &backups[..backups.len() - BACKUPS_TO_KEEP] {
            let _ = fs::remove_file(old);
        }
    }
    Ok(Some(dest))
}

// ─── Crash recovery for projects that have no file yet ───────────

const RECOVERY_FILE: &str = "recovery.fabulator.json";
const DISCARDED_FILE: &str = "discarded.fabulator.json";

/// Keep a copy of unsaved work (atomic). `dir` is created if needed.
pub fn write_recovery(dir: &Path, bytes: &[u8]) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    write_atomic(&dir.join(RECOVERY_FILE), bytes)
}

/// The recovery copy, if there is one.
pub fn read_recovery(dir: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(dir.join(RECOVERY_FILE)) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Remove the recovery copy. With `keep`, it is moved to a single
/// "discarded" file instead (replacing the previous one), so declining a
/// restore by mistake is not fatal.
pub fn clear_recovery(dir: &Path, keep: bool) -> io::Result<()> {
    let file = dir.join(RECOVERY_FILE);
    if !file.exists() {
        return Ok(());
    }
    if keep {
        let _ = fs::remove_file(dir.join(DISCARDED_FILE));
        fs::rename(&file, dir.join(DISCARDED_FILE))
    } else {
        fs::remove_file(&file)
    }
}

// ─── Live mirror of the project being edited ─────────────────────
//
// The web view sends the whole unsaved project here a moment after each
// edit. Rust keeps it in memory (survives a WebView reload) and also on
// disk (survives a crash). It only exists while there are unsaved changes.

const LIVE_FILE: &str = "live.fabulator.json";

/// Write the live copy (atomic). `dir` is created if needed.
pub fn write_live(dir: &Path, bytes: &[u8]) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    write_atomic(&dir.join(LIVE_FILE), bytes)
}

/// The live copy on disk, if there is one.
pub fn read_live(dir: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(dir.join(LIVE_FILE)) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Remove the live copy (nothing to remove is fine).
pub fn clear_live(dir: &Path) -> io::Result<()> {
    match fs::remove_file(dir.join(LIVE_FILE)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

// ─── User colour themes (one small JSON file each) ───────────────

/// Theme files are tiny; anything bigger is not a theme.
pub const MAX_THEME_BYTES: u64 = 256 * 1024;
const MAX_THEME_FILES: usize = 2000;
/// Most theme files a folder scan will return; beyond this the user picks a narrower folder.
pub const MAX_THEME_SCAN: usize = 5000;

/// Only plain "<slug>.json" names, so a theme can never be written outside its folder.
pub fn is_safe_theme_file_name(name: &str) -> bool {
    match name.strip_suffix(".json") {
        Some(stem) => {
            !stem.is_empty()
                && stem.len() <= 48
                && !stem.starts_with('-')
                && stem
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        }
        None => false,
    }
}

fn bad_name() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, "invalid theme file name")
}

/// Contents of every valid theme file in `dir` (sorted by file name). A missing folder is an empty list.
pub fn list_themes(dir: &Path) -> io::Result<Vec<String>> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let mut names: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| is_safe_theme_file_name(n))
        .collect();
    names.sort();
    names.truncate(MAX_THEME_FILES);

    let mut out = Vec::new();
    for name in names {
        let path = dir.join(&name);
        let small = fs::metadata(&path).map(|m| m.len() <= MAX_THEME_BYTES).unwrap_or(false);
        if !small {
            continue;
        }
        if let Ok(text) = fs::read_to_string(&path) {
            out.push(text);
        }
    }
    Ok(out)
}

pub fn write_theme(dir: &Path, name: &str, bytes: &[u8]) -> io::Result<()> {
    if !is_safe_theme_file_name(name) || bytes.len() as u64 > MAX_THEME_BYTES {
        return Err(bad_name());
    }
    fs::create_dir_all(dir)?;
    write_atomic(&dir.join(name), bytes)
}

/// Removing a theme that is already gone is fine.
pub fn delete_theme(dir: &Path, name: &str) -> io::Result<()> {
    if !is_safe_theme_file_name(name) {
        return Err(bad_name());
    }
    match fs::remove_file(dir.join(name)) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// Save several themes at once. Every name and size is checked before anything is written.
pub fn write_themes(dir: &Path, files: &[(String, Vec<u8>)]) -> io::Result<usize> {
    if files.len() > MAX_THEME_FILES {
        return Err(bad_name());
    }
    for (name, bytes) in files {
        if !is_safe_theme_file_name(name) || bytes.len() as u64 > MAX_THEME_BYTES {
            return Err(bad_name());
        }
    }
    for (name, bytes) in files {
        write_theme(dir, name, bytes)?;
    }
    Ok(files.len())
}

/// Remove several themes at once (names are validated first; missing files are fine).
pub fn delete_themes(dir: &Path, names: &[String]) -> io::Result<usize> {
    if names.iter().any(|n| !is_safe_theme_file_name(n)) {
        return Err(bad_name());
    }
    for name in names {
        delete_theme(dir, name)?;
    }
    Ok(names.len())
}

/// Every `.yaml` / `.yml` / `.json` file under `dir` (up to four folders deep) as
/// (path relative to `dir` with '/', text). Hidden and oversized files, symlinks
/// and files that are not UTF-8 are skipped. Sorted by path.
pub fn read_theme_folder(dir: &Path) -> io::Result<Vec<(String, String)>> {
    if !dir.is_dir() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "that is not a folder"));
    }
    fn walk(base: &Path, folder: &Path, depth: usize, out: &mut Vec<(String, String)>) -> io::Result<()> {
        for entry in fs::read_dir(folder)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            let path = entry.path();
            let meta = fs::symlink_metadata(&path)?;
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                if depth < 4 {
                    walk(base, &path, depth + 1, out)?;
                }
                continue;
            }
            let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
            if !matches!(ext.as_str(), "yaml" | "yml" | "json") || meta.len() > MAX_THEME_BYTES {
                continue;
            }
            if let Ok(text) = fs::read_to_string(&path) {
                if out.len() >= MAX_THEME_SCAN {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!("more than {MAX_THEME_SCAN} theme files; choose a smaller folder"),
                    ));
                }
                let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                out.push((rel, text));
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(dir, dir, 0, &mut out)?;
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

/// Read a (small) text file, e.g. a theme the user picked.
pub fn read_text_limited(path: &Path, max_bytes: u64) -> io::Result<String> {
    if fs::metadata(path)?.len() > max_bytes {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "file is too big"));
    }
    fs::read_to_string(path)
}

// ─── Project as a folder (Markdown files) ───────────────────

/// The file that marks a folder as a Fabulator project folder.
pub const FOLDER_MARKER: &str = "project.json";
const FOLDER_ROOTS: [&str; 2] = ["manuscript", "notes"];
pub const MAX_FOLDER_FILES: usize = 20_000;
pub const MAX_FOLDER_FILE_BYTES: u64 = 5 * 1024 * 1024;
pub const MAX_FOLDER_TOTAL_BYTES: u64 = 200 * 1024 * 1024;

/// Paths Fabulator itself writes: `project.json`, or `.md` files inside
/// `manuscript/` or `notes/`, using only `a-z 0-9 . _ -` in each name.
pub fn is_safe_folder_path(path: &str) -> bool {
    if path == FOLDER_MARKER {
        return true;
    }
    if path.len() > 400 || !path.ends_with(".md") {
        return false;
    }
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() < 2 || parts.len() > 4 || !FOLDER_ROOTS.contains(&parts[0]) {
        return false;
    }
    parts.iter().all(|c| {
        !c.is_empty()
            && c.len() <= 120
            && !c.starts_with('.')
            && c.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-'))
    })
}

fn folder_is_marked(dir: &Path) -> bool {
    fs::read_to_string(dir.join(FOLDER_MARKER))
        .map(|t| t.contains("\"fabulator-folder\""))
        .unwrap_or(false)
}

/// Anything not hidden counts as "something is already here".
fn folder_has_foreign_files(dir: &Path) -> io::Result<bool> {
    for entry in fs::read_dir(dir)? {
        if !entry?.file_name().to_string_lossy().starts_with('.') {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Write the project files into `dir`. Returns (written, unchanged, removed).
///
/// - Refuses a folder that already has other (non-hidden) files unless it holds
///   an earlier export (`project.json` from Fabulator); an empty or freshly
///   `git init`-ed folder is fine.
/// - Only rewrites files whose text changed, so git sees no churn.
/// - Removes `.md` files under `manuscript/` and `notes/` that are no longer
///   part of the project (renamed or deleted scenes); nothing else is deleted.
pub fn write_folder(dir: &Path, files: &[(String, Vec<u8>)]) -> io::Result<(usize, usize, usize)> {
    let invalid = |m: String| io::Error::new(io::ErrorKind::InvalidInput, m);

    if files.len() > MAX_FOLDER_FILES {
        return Err(invalid("too many files".into()));
    }
    let mut seen = std::collections::HashSet::new();
    let mut total = 0u64;
    for (path, bytes) in files {
        if !is_safe_folder_path(path) {
            return Err(invalid(format!("unsafe file name: {path}")));
        }
        if !seen.insert(path.as_str()) {
            return Err(invalid(format!("duplicate file: {path}")));
        }
        if bytes.len() as u64 > MAX_FOLDER_FILE_BYTES {
            return Err(invalid(format!("{path} is too big")));
        }
        total += bytes.len() as u64;
    }
    if total > MAX_FOLDER_TOTAL_BYTES {
        return Err(invalid("project is too big".into()));
    }

    if dir.exists() {
        if !dir.is_dir() {
            return Err(invalid("that path is not a folder".into()));
        }
        if folder_has_foreign_files(dir)? && !folder_is_marked(dir) {
            return Err(invalid(
                "that folder already has other files. Choose an empty folder, or one you exported to before.".into(),
            ));
        }
    } else {
        fs::create_dir_all(dir)?;
    }

    let (mut written, mut unchanged) = (0, 0);
    for (path, bytes) in files {
        let target = dir.join(path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        if fs::read(&target).map(|old| old == *bytes).unwrap_or(false) {
            unchanged += 1;
        } else {
            write_atomic(&target, bytes)?;
            written += 1;
        }
    }

    let mut removed = 0;
    for root in FOLDER_ROOTS {
        removed += remove_stale(dir, &dir.join(root), &seen)?;
    }
    Ok((written, unchanged, removed))
}

/// Delete `.md` files under `folder` that are not in `keep`, then empty folders. Skips symlinks.
fn remove_stale(base: &Path, folder: &Path, keep: &std::collections::HashSet<&str>) -> io::Result<usize> {
    let entries = match fs::read_dir(folder) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e),
    };
    let mut removed = 0;
    for entry in entries {
        let path = entry?.path();
        let meta = fs::symlink_metadata(&path)?;
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            removed += remove_stale(base, &path, keep)?;
            let _ = fs::remove_dir(&path); // only succeeds when empty
        } else if path.extension().map(|e| e.eq_ignore_ascii_case("md")).unwrap_or(false) {
            let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            if !keep.contains(rel.as_str()) {
                fs::remove_file(&path)?;
                removed += 1;
            }
        }
    }
    Ok(removed)
}

/// Read `project.json` and every `.md` file under `manuscript/` and `notes/`
/// as (relative path with '/', text). Hidden files and symlinks are skipped.
pub fn read_folder(dir: &Path) -> io::Result<Vec<(String, String)>> {
    let bad = |m: String| io::Error::new(io::ErrorKind::InvalidData, m);
    if !folder_is_marked(dir) {
        return Err(bad(format!("{} is missing or is not from Fabulator", FOLDER_MARKER)));
    }
    let mut out: Vec<(String, String)> = Vec::new();
    let mut total = 0u64;

    fn take(path: &Path, rel: String, out: &mut Vec<(String, String)>, total: &mut u64) -> io::Result<()> {
        let len = fs::metadata(path)?.len();
        if len > MAX_FOLDER_FILE_BYTES {
            return Err(io::Error::new(io::ErrorKind::InvalidData, format!("{rel} is too big")));
        }
        *total += len;
        if *total > MAX_FOLDER_TOTAL_BYTES || out.len() >= MAX_FOLDER_FILES {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "the folder is too big"));
        }
        let text = String::from_utf8(fs::read(path)?)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, format!("{rel} is not UTF-8 text")))?;
        out.push((rel, text));
        Ok(())
    }

    fn walk(base: &Path, folder: &Path, depth: usize, out: &mut Vec<(String, String)>, total: &mut u64) -> io::Result<()> {
        for entry in fs::read_dir(folder)? {
            let entry = entry?;
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let path = entry.path();
            let meta = fs::symlink_metadata(&path)?;
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                if depth < 3 {
                    walk(base, &path, depth + 1, out, total)?;
                }
            } else if path.extension().map(|e| e.eq_ignore_ascii_case("md")).unwrap_or(false) {
                let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                take(&path, rel, out, total)?;
            }
        }
        Ok(())
    }

    take(&dir.join(FOLDER_MARKER), FOLDER_MARKER.to_string(), &mut out, &mut total)?;
    for root in FOLDER_ROOTS {
        let p = dir.join(root);
        if p.is_dir() {
            walk(dir, &p, 1, &mut out, &mut total)?;
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}


#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("fab-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn theme_file_names_are_locked_down() {
        for ok in ["dracula.json", "tokyo-night.json", "a1.json"] {
            assert!(is_safe_theme_file_name(ok), "{ok}");
        }
        for bad in ["", ".json", "-x.json", "A.json", "../x.json", "a/b.json", "a\\b.json", "x.txt", "x.json.exe", "x y.json"] {
            assert!(!is_safe_theme_file_name(bad), "{bad}");
        }
        assert!(!is_safe_theme_file_name(&format!("{}.json", "a".repeat(49))));
    }

    #[test]
    fn themes_write_list_delete() {
        let d = scratch("themes").join("themes");
        assert!(list_themes(&d).unwrap().is_empty()); // missing folder is fine
        write_theme(&d, "b-theme.json", b"{\"b\":1}").unwrap(); // creates the folder
        write_theme(&d, "a-theme.json", b"{\"a\":1}").unwrap();
        write_theme(&d, "a-theme.json", b"{\"a\":2}").unwrap(); // overwrite
        fs::write(d.join("notes.txt"), "ignore me").unwrap();
        fs::write(d.join("Bad Name.json"), "ignore me").unwrap();
        assert_eq!(list_themes(&d).unwrap(), vec!["{\"a\":2}".to_string(), "{\"b\":1}".to_string()]);

        assert!(write_theme(&d, "../escape.json", b"x").is_err());
        assert!(!d.parent().unwrap().join("escape.json").exists());
        let big = vec![b'x'; (MAX_THEME_BYTES + 1) as usize];
        assert!(write_theme(&d, "big.json", &big).is_err());

        delete_theme(&d, "a-theme.json").unwrap();
        delete_theme(&d, "a-theme.json").unwrap(); // already gone: fine
        assert!(delete_theme(&d, "../x.json").is_err());
        assert_eq!(list_themes(&d).unwrap().len(), 1);
    }

    #[test]
    fn read_text_limited_refuses_big_files() {
        let d = scratch("readtext");
        fs::write(d.join("s.txt"), "hello").unwrap();
        assert_eq!(read_text_limited(&d.join("s.txt"), 10).unwrap(), "hello");
        assert!(read_text_limited(&d.join("s.txt"), 3).is_err());
        assert!(read_text_limited(&d.join("missing.txt"), 10).is_err());
    }

    #[test]
    fn live_copy_roundtrip_and_clear() {
        let d = scratch("live").join("nested").join("recovery");
        assert_eq!(read_live(&d).unwrap(), None);
        clear_live(&d).unwrap(); // clearing nothing is fine
        write_live(&d, b"one").unwrap(); // creates the folder
        write_live(&d, b"two").unwrap();
        assert_eq!(read_live(&d).unwrap().as_deref(), Some("two"));
        // independent of the pathless recovery copy
        assert_eq!(read_recovery(&d).unwrap(), None);
        clear_live(&d).unwrap();
        assert_eq!(read_live(&d).unwrap(), None);
    }

    #[test]
    fn recovery_roundtrip_discard_and_clear() {
        let d = scratch("recovery").join("nested").join("recovery");
        assert_eq!(read_recovery(&d).unwrap(), None); // nothing yet, no error
        clear_recovery(&d, false).unwrap(); // clearing nothing is fine

        write_recovery(&d, b"first").unwrap(); // creates the folder
        write_recovery(&d, b"second").unwrap();
        assert_eq!(read_recovery(&d).unwrap().as_deref(), Some("second"));

        clear_recovery(&d, true).unwrap(); // kept as "discarded"
        assert_eq!(read_recovery(&d).unwrap(), None);
        assert_eq!(fs::read_to_string(d.join("discarded.fabulator.json")).unwrap(), "second");

        write_recovery(&d, b"third").unwrap();
        clear_recovery(&d, true).unwrap(); // replaces the previous discarded copy
        assert_eq!(fs::read_to_string(d.join("discarded.fabulator.json")).unwrap(), "third");

        write_recovery(&d, b"fourth").unwrap();
        clear_recovery(&d, false).unwrap(); // really gone
        assert_eq!(read_recovery(&d).unwrap(), None);
    }

    #[test]
    fn atomic_write_replaces_and_leaves_no_tmp() {
        let d = scratch("atomic");
        let p = d.join("story.fabulator.json");
        write_atomic(&p, b"one").unwrap();
        write_atomic(&p, b"two").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "two");
        assert!(!d.join("story.fabulator.json.tmp").exists());
    }

    #[test]
    fn atomic_write_failure_keeps_original() {
        let d = scratch("fail");
        let p = d.join("story.json");
        write_atomic(&p, b"keep me").unwrap();
        // A directory squatting on the temp name makes File::create fail.
        fs::create_dir(d.join("story.json.tmp")).unwrap();
        assert!(write_atomic(&p, b"new").is_err());
        assert_eq!(fs::read_to_string(&p).unwrap(), "keep me");
    }

    #[test]
    fn no_backup_when_file_missing() {
        let d = scratch("nofile");
        assert!(backup_existing(&d.join("x.json"), true, 1000).unwrap().is_none());
    }

    #[test]
    fn autosave_backups_are_throttled_but_forced_ones_are_not() {
        let d = scratch("throttle");
        let p = d.join("s.json");
        fs::write(&p, "v1").unwrap();

        assert!(backup_existing(&p, false, 1_000).unwrap().is_some());
        assert!(backup_existing(&p, false, 1_100).unwrap().is_none()); // < 300s
        assert!(backup_existing(&p, true, 1_101).unwrap().is_some()); // forced
        assert!(backup_existing(&p, false, 1_500).unwrap().is_some()); // > 300s after 1101
        assert_eq!(list_backups(&backup_dir(&p)).unwrap().len(), 3);
    }

    #[test]
    fn old_backups_are_pruned_and_content_is_preserved() {
        let d = scratch("prune");
        let p = d.join("s.json");
        for i in 0..(BACKUPS_TO_KEEP as u64 + 5) {
            fs::write(&p, format!("v{i}")).unwrap();
            backup_existing(&p, true, 10_000 + i).unwrap();
        }
        let list = list_backups(&backup_dir(&p)).unwrap();
        assert_eq!(list.len(), BACKUPS_TO_KEEP);
        assert_eq!(list[0].1, 10_005); // the 5 oldest are gone
        assert_eq!(fs::read_to_string(&list[0].0).unwrap(), "v5");
    }

    fn pairs(list: &[(&str, &str)]) -> Vec<(String, Vec<u8>)> {
        list.iter().map(|(p, t)| (p.to_string(), t.as_bytes().to_vec())).collect()
    }

    #[test]
    fn folder_paths_are_locked_down() {
        for ok in ["project.json", "manuscript/01-a/_chapter.md", "manuscript/01-a/02-b.md", "notes/01-n.md"] {
            assert!(is_safe_folder_path(ok), "{ok}");
        }
        for bad in [
            "", "other.json", "manuscript", "manuscript/x.txt", "../x.md", "manuscript/../x.md", "/etc/x.md",
            "manuscript//x.md", "manuscript/.hidden/x.md", "manuscript\\x.md", "manuscript/A.md", "manuscript/a b.md",
            "manuscript/c:x.md", "src/x.md", "manuscript/a/b/c/d.md", "manuscript/\u{e9}.md",
        ] {
            assert!(!is_safe_folder_path(bad), "{bad}");
        }
        assert!(!is_safe_folder_path(&format!("notes/{}.md", "a".repeat(121))));
    }

    #[test]
    fn folder_write_read_roundtrip_and_no_churn() {
        let d = scratch("folder-rt").join("story");
        let files = pairs(&[
            ("project.json", "{\"format\":\"fabulator-folder\"}"),
            ("manuscript/01-a/_chapter.md", "chapter"),
            ("manuscript/01-a/01-s.md", "scene \u{e9}\u{4e2d}"),
            ("notes/01-n.md", "note"),
        ]);
        assert_eq!(write_folder(&d, &files).unwrap(), (4, 0, 0)); // creates the folder
        assert_eq!(write_folder(&d, &files).unwrap(), (0, 4, 0)); // nothing rewritten
        let read = read_folder(&d).unwrap();
        assert_eq!(read.len(), 4);
        assert_eq!(read[0].0, "manuscript/01-a/01-s.md");
        assert_eq!(read[0].1, "scene \u{e9}\u{4e2d}");
        assert!(read.iter().any(|(p, _)| p == "project.json"));
    }

    #[test]
    fn folder_removes_stale_scene_files_only() {
        let d = scratch("folder-stale");
        let v1 = pairs(&[
            ("project.json", "{\"format\":\"fabulator-folder\"}"),
            ("manuscript/01-a/01-old.md", "x"),
            ("manuscript/02-b/01-keep.md", "y"),
            ("notes/01-n.md", "n"),
        ]);
        write_folder(&d, &v1).unwrap();
        fs::write(d.join("README.txt"), "mine").unwrap();
        fs::write(d.join("manuscript/01-a/photo.png"), "bin").unwrap();
        fs::create_dir_all(d.join(".git")).unwrap();
        fs::write(d.join(".git/config"), "git").unwrap();

        let v2 = pairs(&[
            ("project.json", "{\"format\":\"fabulator-folder\"}"),
            ("manuscript/01-b/01-keep.md", "y"),
        ]);
        let (w, u, r) = write_folder(&d, &v2).unwrap();
        assert_eq!((w, u, r), (1, 1, 3)); // removed: old scene, keep in old chapter dir, note
        assert!(!d.join("manuscript/01-a/01-old.md").exists());
        assert!(!d.join("manuscript/02-b").exists()); // emptied folder is gone
        assert!(d.join("manuscript/01-a/photo.png").exists()); // non-.md untouched (folder stays)
        assert!(d.join("README.txt").exists());
        assert!(d.join(".git/config").exists());
        assert!(!d.join("notes/01-n.md").exists());
    }

    #[test]
    fn folder_write_refuses_foreign_folders_but_accepts_empty_and_git() {
        let d = scratch("folder-foreign");
        fs::write(d.join("thesis.docx"), "precious").unwrap();
        let files = pairs(&[("project.json", "{\"format\":\"fabulator-folder\"}")]);
        assert!(write_folder(&d, &files).is_err());
        assert!(d.join("thesis.docx").exists());

        let g = scratch("folder-git");
        fs::create_dir_all(g.join(".git")).unwrap(); // a fresh `git init` is still "empty"
        assert!(write_folder(&g, &files).is_ok());

        // a file where a folder should be
        let f = scratch("folder-file").join("x");
        fs::write(&f, "file").unwrap();
        assert!(write_folder(&f, &files).is_err());
    }

    #[test]
    fn folder_write_validates_before_touching_disk() {
        let d = scratch("folder-validate").join("out");
        let bad = pairs(&[("project.json", "{}"), ("manuscript/../../evil.md", "x")]);
        assert!(write_folder(&d, &bad).is_err());
        assert!(!d.exists());
        let dup = pairs(&[("project.json", "a"), ("project.json", "b")]);
        assert!(write_folder(&d, &dup).is_err());
        let big = vec![("project.json".to_string(), vec![b'x'; (MAX_FOLDER_FILE_BYTES + 1) as usize])];
        assert!(write_folder(&d, &big).is_err());
        assert!(!d.exists());
    }

    #[test]
    fn folder_read_rules() {
        let d = scratch("folder-read");
        assert!(read_folder(&d).is_err()); // no marker
        fs::write(d.join("project.json"), "{\"format\":\"fabulator-folder\"}").unwrap();
        fs::create_dir_all(d.join("manuscript/01-a")).unwrap();
        fs::write(d.join("manuscript/01-a/10-b.md"), "b").unwrap();
        fs::write(d.join("manuscript/01-a/02-a.md"), "a").unwrap();
        fs::write(d.join("manuscript/01-a/notes.txt"), "skip").unwrap();
        fs::write(d.join("manuscript/01-a/.hidden.md"), "skip").unwrap();
        fs::create_dir_all(d.join("elsewhere")).unwrap();
        fs::write(d.join("elsewhere/x.md"), "skip").unwrap();
        fs::write(d.join("manuscript/01-a/bad.md"), [0xff, 0xfe, 0x00]).unwrap();
        assert!(read_folder(&d).is_err()); // not UTF-8, named in the error
        fs::remove_file(d.join("manuscript/01-a/bad.md")).unwrap();
        let paths: Vec<String> = read_folder(&d).unwrap().into_iter().map(|(p, _)| p).collect();
        assert_eq!(paths, vec!["manuscript/01-a/02-a.md", "manuscript/01-a/10-b.md", "project.json"]);
    }

    #[test]
    fn theme_batches_validate_first_and_write_many() {
        let d = scratch("theme-batch").join("themes");
        let ok = vec![("a-one.json".to_string(), b"1".to_vec()), ("b-two.json".to_string(), b"2".to_vec())];
        assert_eq!(write_themes(&d, &ok).unwrap(), 2);
        assert_eq!(list_themes(&d).unwrap().len(), 2);

        let mixed = vec![("c-three.json".to_string(), b"3".to_vec()), ("../evil.json".to_string(), b"x".to_vec())];
        assert!(write_themes(&d, &mixed).is_err());
        assert!(!d.join("c-three.json").exists()); // nothing written when one name is bad

        assert_eq!(delete_themes(&d, &["a-one.json".to_string(), "missing.json".to_string()]).unwrap(), 2);
        assert!(delete_themes(&d, &["b-two.json".to_string(), "bad name.json".to_string()]).is_err());
        assert!(d.join("b-two.json").exists());
    }

    #[test]
    fn theme_folder_scan_rules() {
        let d = scratch("theme-scan");
        fs::create_dir_all(d.join("base16")).unwrap();
        fs::create_dir_all(d.join("base24/deep/er/er/er/er")).unwrap();
        fs::create_dir_all(d.join(".git")).unwrap();
        fs::write(d.join("base16/dracula.yaml"), "name: Dracula").unwrap();
        fs::write(d.join("base16/Nord.YML"), "name: Nord").unwrap();
        fs::write(d.join("base24/x.json"), "{}").unwrap();
        fs::write(d.join("base24/deep/er/er/er/er/too-deep.yaml"), "x").unwrap();
        fs::write(d.join("base16/readme.md"), "skip").unwrap();
        fs::write(d.join("base16/.hidden.yaml"), "skip").unwrap();
        fs::write(d.join(".git/config.yaml"), "skip").unwrap();
        fs::write(d.join("base16/bad.yaml"), [0xff, 0xfe]).unwrap(); // not UTF-8: skipped
        fs::write(d.join("base16/huge.yaml"), vec![b'x'; (MAX_THEME_BYTES + 1) as usize]).unwrap();
        let names: Vec<String> = read_theme_folder(&d).unwrap().into_iter().map(|(n, _)| n).collect();
        assert_eq!(names, vec!["base16/Nord.YML", "base16/dracula.yaml", "base24/x.json"]);
        assert!(read_theme_folder(&d.join("base16/dracula.yaml")).is_err()); // a file, not a folder
        assert!(read_theme_folder(&d.join("missing")).is_err());
    }
}
