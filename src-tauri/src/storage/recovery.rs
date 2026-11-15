//! Unsaved-work copies: what would be lost if the app died right now.

use std::fs;
use std::io;
use std::path::Path;

use super::atomic::write_atomic;

// ─── Unsaved work ────────────────────────────────────────────────
//
// One concept: "what would be lost if the app died right now". While there are
// unsaved changes the web view sends the whole project here (`write_live`);
// Rust keeps it in memory (survives a WebView reload) and in a file (survives a
// crash). Older versions kept a separate recovery copy of projects that had no
// file yet (`recovery.fabulator.json`); it is still read, never written.

const LIVE_FILE: &str = "live.fabulator.json";
const LEGACY_RECOVERY_FILE: &str = "recovery.fabulator.json";
const DISCARDED_FILE: &str = "discarded.fabulator.json";

/// Where a copy of unsaved work came from.
pub const SOURCE_MEMORY: &str = "memory";
pub const SOURCE_DISK: &str = "disk";
pub const SOURCE_LEGACY: &str = "legacy";

/// Write the live copy (atomic). `dir` is created if needed.
pub fn write_live(dir: &Path, bytes: &[u8]) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    write_atomic(&dir.join(LIVE_FILE), bytes)
}

fn read_optional(path: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// The copy to offer: the one in memory (the web view was reloaded), else the
/// live file (the app restarted or crashed), else a legacy recovery copy.
/// Returns where it came from and its text.
pub fn choose_unsaved(memory: Option<String>, dir: &Path) -> io::Result<Option<(&'static str, String)>> {
    if let Some(text) = memory {
        return Ok(Some((SOURCE_MEMORY, text)));
    }
    if let Some(text) = read_optional(&dir.join(LIVE_FILE))? {
        return Ok(Some((SOURCE_DISK, text)));
    }
    Ok(read_optional(&dir.join(LEGACY_RECOVERY_FILE))?.map(|text| (SOURCE_LEGACY, text)))
}

/// Forget the unsaved copies on disk. With `keep`, the newest one (live, else
/// legacy) is moved to a single "discarded" file instead (replacing the
/// previous one), so declining a restore by mistake is not fatal.
pub fn discard_unsaved(dir: &Path, keep: bool) -> io::Result<()> {
    let live = dir.join(LIVE_FILE);
    let legacy = dir.join(LEGACY_RECOVERY_FILE);
    let discarded = dir.join(DISCARDED_FILE);

    if keep {
        let newest = if live.is_file() {
            Some(&live)
        } else if legacy.is_file() {
            Some(&legacy)
        } else {
            None
        };
        if let Some(src) = newest {
            let _ = fs::remove_file(&discarded);
            fs::rename(src, &discarded)?;
        }
    }
    for f in [&live, &legacy] {
        match fs::remove_file(f) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

/// A successful save of a project that used to have only a legacy recovery copy
/// makes that copy obsolete. (The live copy is handled by the web view, because
/// only it knows whether more edits arrived while the save was running.)
pub fn clear_legacy_recovery(dir: &Path) -> io::Result<()> {
    match fs::remove_file(dir.join(LEGACY_RECOVERY_FILE)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::testutil::scratch;

    #[test]
    fn unsaved_work_prefers_memory_then_live_then_legacy() {
        let d = scratch("unsaved-choose").join("nested").join("recovery");
        assert_eq!(choose_unsaved(None, &d).unwrap(), None); // nothing, no error

        fs::create_dir_all(&d).unwrap();
        fs::write(d.join(LEGACY_RECOVERY_FILE), "legacy").unwrap();
        assert_eq!(choose_unsaved(None, &d).unwrap(), Some((SOURCE_LEGACY, "legacy".to_string())));

        write_live(&d, b"live").unwrap();
        assert_eq!(choose_unsaved(None, &d).unwrap(), Some((SOURCE_DISK, "live".to_string())));

        assert_eq!(
            choose_unsaved(Some("mem".to_string()), &d).unwrap(),
            Some((SOURCE_MEMORY, "mem".to_string()))
        );
    }

    #[test]
    fn live_copy_is_replaced_atomically() {
        let d = scratch("unsaved-live").join("x");
        write_live(&d, b"one").unwrap();
        write_live(&d, b"two").unwrap();
        assert_eq!(read_optional(&d.join(LIVE_FILE)).unwrap().as_deref(), Some("two"));
    }

    #[test]
    fn discarding_removes_everything_or_sets_the_newest_aside() {
        let d = scratch("unsaved-discard").join("recovery");
        discard_unsaved(&d, false).unwrap(); // nothing to discard is fine
        discard_unsaved(&d, true).unwrap();

        write_live(&d, b"first").unwrap();
        fs::write(d.join(LEGACY_RECOVERY_FILE), "old").unwrap();
        discard_unsaved(&d, true).unwrap(); // the live copy is the newest
        assert_eq!(choose_unsaved(None, &d).unwrap(), None);
        assert_eq!(read_optional(&d.join(DISCARDED_FILE)).unwrap().as_deref(), Some("first"));

        write_live(&d, b"second").unwrap();
        discard_unsaved(&d, true).unwrap(); // replaces the previous discarded copy
        assert_eq!(read_optional(&d.join(DISCARDED_FILE)).unwrap().as_deref(), Some("second"));

        fs::write(d.join(LEGACY_RECOVERY_FILE), "only legacy").unwrap();
        discard_unsaved(&d, true).unwrap(); // falls back to the legacy copy
        assert_eq!(read_optional(&d.join(DISCARDED_FILE)).unwrap().as_deref(), Some("only legacy"));

        write_live(&d, b"third").unwrap();
        discard_unsaved(&d, false).unwrap(); // really gone (the kept copy stays)
        assert_eq!(choose_unsaved(None, &d).unwrap(), None);
        assert_eq!(read_optional(&d.join(DISCARDED_FILE)).unwrap().as_deref(), Some("only legacy"));
    }

    #[test]
    fn saving_clears_only_the_legacy_recovery_copy() {
        let d = scratch("unsaved-legacy-save").join("recovery");
        clear_legacy_recovery(&d).unwrap(); // nothing there: fine
        write_live(&d, b"live").unwrap();
        fs::write(d.join(LEGACY_RECOVERY_FILE), "old").unwrap();
        clear_legacy_recovery(&d).unwrap();
        assert_eq!(choose_unsaved(None, &d).unwrap(), Some((SOURCE_DISK, "live".to_string())));
    }
}
