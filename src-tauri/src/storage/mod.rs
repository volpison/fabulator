//! Crash-safe file storage: atomic writes, rotating backups, unsaved-work copies, user themes
//! and the project-as-a-folder format.
//!
//! Deliberately std-only so it can be unit-tested in isolation. Each concern has its own file; this
//! module re-exports their public items, so callers still write `storage::write_atomic` and so on.

mod atomic;
mod backup;
mod folder;
mod recovery;
mod themes;

pub use atomic::*;
pub use backup::*;
pub use folder::*;
pub use recovery::*;
pub use themes::*;

/// Shared by the tests of every storage module.
#[cfg(test)]
mod testutil {
    use std::fs;
    use std::path::PathBuf;

    pub fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("fab-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
}
