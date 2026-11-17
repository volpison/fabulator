//! File names for projects kept in the app's own folder (used on Android, where a project is a private
//! working copy): a name that is safe everywhere, and one that is not already taken.

use std::path::{Path, PathBuf};

/// A file name stem made from a story title: characters that are not allowed in file names become `_`,
/// leading and trailing spaces and dots go, and it is never empty or longer than 80 characters.
pub fn safe_file_stem(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}

/// `dir/<stem><ext>`, or `dir/<stem> (2)<ext>`, `(3)`… when that name is already taken.
pub fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{stem}{ext}"));
    if !first.exists() {
        return first;
    }
    let mut n = 2u32;
    loop {
        let candidate = dir.join(format!("{stem} ({n}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::testutil::scratch;
    use std::fs;

    #[test]
    fn stem_replaces_forbidden_characters() {
        assert_eq!(safe_file_stem("Wolf: a/b?"), "Wolf_ a_b_");
    }

    #[test]
    fn stem_is_never_empty() {
        assert_eq!(safe_file_stem("  ... "), "Untitled");
        assert_eq!(safe_file_stem(""), "Untitled");
    }

    #[test]
    fn stem_is_cut_to_80_characters() {
        assert_eq!(safe_file_stem(&"a".repeat(200)).chars().count(), 80);
    }

    #[test]
    fn unique_path_counts_up_when_taken() {
        let d = scratch("names");
        let ext = ".fabulator.json";
        let first = unique_path(&d, "Story", ext);
        assert_eq!(first, d.join("Story.fabulator.json"));
        fs::write(&first, "x").unwrap();
        let second = unique_path(&d, "Story", ext);
        assert_eq!(second, d.join("Story (2).fabulator.json"));
        fs::write(&second, "x").unwrap();
        assert_eq!(unique_path(&d, "Story", ext), d.join("Story (3).fabulator.json"));
    }
}
