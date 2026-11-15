//! User colour themes: one small JSON file each, in the app's data folder.

use std::fs;
use std::io;
use std::path::Path;

use super::atomic::write_atomic;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::testutil::scratch;

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
