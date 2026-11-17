//! Files on the person's device that are not ordinary paths. On Android the file picker returns a
//! `content://` address that `std::fs` cannot open, so every read or write of a picked file goes
//! through here: a content address is opened with the file-system plugin, anything else is a path.
//!
//! A project on Android is a **private working copy** in the app's own folder (see
//! docs/technical/android.md): *import* copies a picked file in, *export* writes a copy out. The
//! rest of the app (atomic saves, backups, recovery) then works on ordinary paths, unchanged.

use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;

use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

use crate::storage;

use super::projects_dir;

/// The biggest project file we will read (a safety limit, far above any real story).
const MAX_PROJECT_BYTES: u64 = 256 * 1024 * 1024;

pub(super) fn is_content_uri(location: &str) -> bool {
    location.starts_with("content://")
}

fn content_path(location: &str) -> Result<FilePath, String> {
    location.parse::<FilePath>().map_err(|e| format!("Not a valid file address: {e}"))
}

/// Read a picked file (path or content address), at most `max_bytes`.
pub(super) fn read_location(app: &tauri::AppHandle, location: &str, max_bytes: u64) -> Result<Vec<u8>, String> {
    let too_big = || "That file is too large to open.".to_string();
    if is_content_uri(location) {
        let mut opts = OpenOptions::new();
        opts.read(true);
        let file = app
            .fs()
            .open(content_path(location)?, opts)
            .map_err(|e| format!("Read error: {e}"))?;
        let mut bytes = Vec::new();
        file.take(max_bytes + 1).read_to_end(&mut bytes).map_err(|e| format!("Read error: {e}"))?;
        if bytes.len() as u64 > max_bytes {
            return Err(too_big());
        }
        Ok(bytes)
    } else {
        let path = PathBuf::from(location);
        let len = fs::metadata(&path).map_err(|e| format!("Read error: {e}"))?.len();
        if len > max_bytes {
            return Err(too_big());
        }
        fs::read(&path).map_err(|e| format!("Read error: {e}"))
    }
}

/// Write bytes to a picked location. A path is written atomically; a content address is
/// opened for writing and truncated (there is no rename on those).
pub(super) fn write_location(app: &tauri::AppHandle, location: &str, bytes: &[u8]) -> Result<(), String> {
    if is_content_uri(location) {
        let mut opts = OpenOptions::new();
        opts.write(true).truncate(true).create(true);
        let mut file = app
            .fs()
            .open(content_path(location)?, opts)
            .map_err(|e| format!("Write error: {e}"))?;
        file.write_all(bytes).map_err(|e| format!("Write error: {e}"))?;
        file.sync_all().map_err(|e| format!("Write error: {e}"))?;
        Ok(())
    } else {
        storage::write_atomic(&PathBuf::from(location), bytes).map_err(|e| format!("Write error: {e}"))
    }
}

/// Copy a picked project file into the app's private folder and return the path of the copy.
/// The file must be JSON; the frontend checks what kind of project it is when it opens it.
#[tauri::command]
pub fn import_project_copy(app: tauri::AppHandle, source: String) -> Result<String, String> {
    let bytes = read_location(&app, &source, MAX_PROJECT_BYTES)?;
    let data: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| "That file is not a Fabulator project (it is not readable as one).".to_string())?;
    if !data.is_object() {
        return Err("That file is not a Fabulator project.".to_string());
    }
    let title = data.get("title").and_then(|v| v.as_str()).unwrap_or("Imported story");
    let dir = projects_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not prepare the app's folder: {e}"))?;
    let path = storage::unique_path(&dir, &storage::safe_file_stem(title), ".fabulator.json");
    storage::write_atomic(&path, &bytes).map_err(|e| format!("Could not copy the file into the app: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

/// A free file name in the app's private folder for a new project (`default_name` is
/// e.g. "My story.fabulator.json"). Nothing is created yet.
#[tauri::command]
pub fn new_project_path(app: tauri::AppHandle, default_name: String) -> Result<String, String> {
    let ext = ".fabulator.json";
    let stem = default_name.strip_suffix(ext).unwrap_or(&default_name);
    let dir = projects_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not prepare the app's folder: {e}"))?;
    Ok(storage::unique_path(&dir, &storage::safe_file_stem(stem), ext).to_string_lossy().into_owned())
}

/// Write a copy of a private project file to a location the person picked.
#[tauri::command]
pub fn export_project_copy(app: tauri::AppHandle, from: String, dest: String) -> Result<(), String> {
    let bytes = fs::read(&from).map_err(|e| format!("Could not read the project: {e}"))?;
    write_location(&app, &dest, &bytes)
}
