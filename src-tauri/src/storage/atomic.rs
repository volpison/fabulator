//! Crash-safe writes and bounded reads: the file primitives everything else builds on.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;

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

/// Read a (small) text file, e.g. a theme the user picked.
pub fn read_text_limited(path: &Path, max_bytes: u64) -> io::Result<String> {
    if fs::metadata(path)?.len() > max_bytes {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "file is too big"));
    }
    fs::read_to_string(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::testutil::scratch;

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
    fn read_text_limited_refuses_big_files() {
        let d = scratch("readtext");
        fs::write(d.join("s.txt"), "hello").unwrap();
        assert_eq!(read_text_limited(&d.join("s.txt"), 10).unwrap(), "hello");
        assert!(read_text_limited(&d.join("s.txt"), 3).is_err());
        assert!(read_text_limited(&d.join("missing.txt"), 10).is_err());
    }
}
