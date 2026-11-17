//! Commands for the user's colour themes (one small JSON file each, in the app's data folder).

use std::path::PathBuf;

use crate::storage;

use super::themes_dir;

/// Read a small text file the user picked (e.g. a colour theme to import).
#[tauri::command]
pub fn read_text_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    if super::device::is_content_uri(&path) {
        let bytes = super::device::read_location(&app, &path, storage::MAX_THEME_BYTES)?;
        return String::from_utf8(bytes).map_err(|_| "Read error: the file is not text.".to_string());
    }
    storage::read_text_limited(&PathBuf::from(path), storage::MAX_THEME_BYTES)
        .map_err(|e| format!("Read error: {e}"))
}

/// The contents of every imported colour theme (the frontend validates them).
#[tauri::command]
pub fn list_user_themes(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    storage::list_themes(&themes_dir(&app)?).map_err(|e| format!("Could not read themes: {e}"))
}

#[tauri::command]
pub fn save_user_theme(app: tauri::AppHandle, file_name: String, contents: String) -> Result<(), String> {
    storage::write_theme(&themes_dir(&app)?, &file_name, contents.as_bytes())
        .map_err(|e| format!("Could not save theme: {e}"))
}

#[tauri::command]
pub fn delete_user_theme(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    storage::delete_theme(&themes_dir(&app)?, &file_name)
        .map_err(|e| format!("Could not remove theme: {e}"))
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ThemeFile {
    /// File name when saving, path relative to the chosen folder when scanning.
    name: String,
    contents: String,
}

/// Save many themes in one go (a folder import).
#[tauri::command]
pub fn save_user_themes(app: tauri::AppHandle, files: Vec<ThemeFile>) -> Result<usize, String> {
    let files: Vec<(String, Vec<u8>)> = files.into_iter().map(|f| (f.name, f.contents.into_bytes())).collect();
    storage::write_themes(&themes_dir(&app)?, &files).map_err(|e| format!("Could not save themes: {e}"))
}

/// Remove many themes in one go (e.g. a whole imported collection).
#[tauri::command]
pub fn delete_user_themes(app: tauri::AppHandle, file_names: Vec<String>) -> Result<usize, String> {
    storage::delete_themes(&themes_dir(&app)?, &file_names).map_err(|e| format!("Could not remove themes: {e}"))
}

/// Every .yaml/.yml/.json file under a folder the user picked (Base16/Base24/VS Code/Fabulator themes).
#[tauri::command]
pub fn read_theme_folder(dir: String) -> Result<Vec<ThemeFile>, String> {
    storage::read_theme_folder(&PathBuf::from(dir))
        .map(|v| v.into_iter().map(|(name, contents)| ThemeFile { name, contents }).collect())
        .map_err(|e| format!("Could not read the folder: {e}"))
}
