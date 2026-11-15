//! The project as a folder of Markdown files (for git, diffs and any editor).

use std::fs;
use std::io;
use std::path::Path;

use super::atomic::write_atomic;

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
    use crate::storage::testutil::scratch;

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
}
