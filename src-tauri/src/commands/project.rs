//! Commands for opening, saving and exporting a project file.

use std::fs;
use std::path::PathBuf;

use crate::models::{self, Project};
use crate::storage;

use super::recovery_dir;

/// The built-in sample story, used for a fresh session.
#[tauri::command]
pub fn sample_project() -> Project {
    Project::sample()
}

/// What opening a project file gives back.
#[derive(serde::Serialize)]
pub struct OpenResult {
    /// The file's JSON as stored. It is deliberately NOT parsed into `Project`
    /// here: older files have a different shape, and the frontend upgrades them
    /// (src/lib/migrate.ts) before they are used.
    data: serde_json::Value,
    /// An untouched copy of an older-format file was put in its backups folder
    /// (the upgraded version will replace the file on the next save).
    backed_up: bool,
}

/// Open a project file. Rule: a file written by an older version is backed up
/// BEFORE the app can overwrite it with the upgraded format. If that backup
/// fails the open fails, so nothing is ever replaced unprotected.
#[tauri::command]
pub fn open_project(path: String) -> Result<OpenResult, String> {
    let path = PathBuf::from(path);
    let text = fs::read_to_string(&path).map_err(|e| format!("Read error: {e}"))?;
    let data: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Parse error: {e}"))?;

    let found = data.get("schema_version").and_then(|v| v.as_u64());
    let backed_up = storage::needs_upgrade_backup(found, models::SCHEMA_VERSION);
    if backed_up {
        storage::backup_existing(&path, true, storage::now_secs()).map_err(|e| {
            format!("Could not back up the older-format file before upgrading it: {e}")
        })?;
    }
    Ok(OpenResult { data, backed_up })
}

/// Save a project crash-safely:
/// 1. serialize first (a serialization error can't touch the old file),
/// 2. back up the current file (rotating; throttled unless `force_backup`),
/// 3. atomically replace the file via temp-file + rename,
/// 4. drop a legacy recovery copy, which the saved file now supersedes.
#[tauri::command]
pub fn save_project(
    app: tauri::AppHandle,
    path: String,
    project: Project,
    force_backup: bool,
) -> Result<(), String> {
    let json =
        serde_json::to_string_pretty(&project).map_err(|e| format!("Serialize error: {e}"))?;
    write_project_file(&app, &path, &json, force_backup)
}

/// Steps 2-4 of saving, shared by every way of saving.
pub(super) fn write_project_file(
    app: &tauri::AppHandle,
    path: &str,
    json: &str,
    force_backup: bool,
) -> Result<(), String> {
    let path = PathBuf::from(path);

    // A failed backup must never block saving your work.
    if let Err(e) = storage::backup_existing(&path, force_backup, storage::now_secs()) {
        eprintln!("backup failed for {}: {e}", path.display());
    }

    storage::write_atomic(&path, json.as_bytes()).map_err(|e| format!("Write error: {e}"))?;

    if let Ok(dir) = recovery_dir(app) {
        let _ = storage::clear_legacy_recovery(&dir); // best effort
    }
    Ok(())
}

/// Write an exported file (.docx, .epub, .md, .txt) to the path (or Android content address) the user picked.
/// Atomic for a path, so a failed export can never leave a half-written file behind.
#[tauri::command]
pub fn write_export(app: tauri::AppHandle, path: String, bytes: Vec<u8>) -> Result<(), String> {
    super::device::write_location(&app, &path, &bytes)
}
