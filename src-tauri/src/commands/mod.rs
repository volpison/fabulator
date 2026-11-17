//! The Tauri commands the web view calls, one file per job. The logic that touches the disk lives in
//! `storage/`; these functions only translate between the web view's data and it.

pub mod device;
pub mod folder;
pub mod project;
pub mod themes;
pub mod unsaved;

use std::path::PathBuf;

use tauri::Manager;

/// Where unsaved-work copies live (the app's own data folder).
pub(super) fn recovery_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("recovery"))
        .map_err(|e| format!("No app data folder: {e}"))
}

pub(super) fn themes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("themes"))
        .map_err(|e| format!("No app data folder: {e}"))
}

/// Where projects live when the app keeps its own copies (Android).
pub(super) fn projects_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("projects"))
        .map_err(|e| format!("No app data folder: {e}"))
}
