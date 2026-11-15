//! Rotating backups of a project file, and the one-off backup made before an older file is upgraded.

use std::fs;
use std::io;
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

/// Opening a file written by an older version of Fabulator: it is upgraded in
/// memory and will replace the old file on the next save, so an untouched copy
/// is kept first. Files without a version are the oldest format.
pub fn needs_upgrade_backup(found: Option<u64>, current: u32) -> bool {
    match found {
        None => true,
        Some(v) => v < u64::from(current),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::testutil::scratch;

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

    #[test]
    fn only_older_or_unversioned_files_get_an_upgrade_backup() {
        assert!(needs_upgrade_backup(None, 6));
        assert!(needs_upgrade_backup(Some(0), 6));
        assert!(needs_upgrade_backup(Some(5), 6));
        assert!(!needs_upgrade_backup(Some(6), 6));
        assert!(!needs_upgrade_backup(Some(7), 6)); // newer: the app refuses it elsewhere
    }
}
