mod models;
mod storage;

use models::Project;
use tauri::Manager;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// The built-in sample story, used for a fresh session.
#[tauri::command]
fn sample_project() -> Project {
    Project::sample()
}

/// Read a project file as raw JSON. It is deliberately NOT parsed into
/// `Project` here: older files have a different shape, and the frontend
/// upgrades them (src/lib/migrate.ts) before they are used.
#[tauri::command]
fn load_project(path: String) -> Result<serde_json::Value, String> {
    let data = fs::read_to_string(&path).map_err(|e| format!("Read error: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("Parse error: {e}"))
}

/// Snapshot the file on disk into its backups folder (always, not throttled).
/// Used right before an upgraded project can overwrite an older-format file.
#[tauri::command]
fn backup_project(path: String) -> Result<(), String> {
    storage::backup_existing(&PathBuf::from(path), true, storage::now_secs())
        .map(|_| ())
        .map_err(|e| format!("Backup error: {e}"))
}

/// Save a project crash-safely:
/// 1. serialize first (a serialization error can't touch the old file),
/// 2. back up the current file (rotating; throttled unless `force_backup`),
/// 3. atomically replace the file via temp-file + rename.
#[tauri::command]
fn save_project(path: String, project: Project, force_backup: bool) -> Result<(), String> {
    let json =
        serde_json::to_string_pretty(&project).map_err(|e| format!("Serialize error: {e}"))?;
    let path = PathBuf::from(path);

    // A failed backup must never block saving your work.
    if let Err(e) = storage::backup_existing(&path, force_backup, storage::now_secs()) {
        eprintln!("backup failed for {}: {e}", path.display());
    }

    storage::write_atomic(&path, json.as_bytes()).map_err(|e| format!("Write error: {e}"))
}

/// Where unsaved-work recovery copies live (the app's own data folder).
fn recovery_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("recovery"))
        .map_err(|e| format!("No app data folder: {e}"))
}

/// Keep a copy of a project that has no file yet, so a crash cannot lose it.
#[tauri::command]
fn write_recovery(app: tauri::AppHandle, project: Project) -> Result<(), String> {
    let json =
        serde_json::to_string(&project).map_err(|e| format!("Serialize error: {e}"))?;
    storage::write_recovery(&recovery_dir(&app)?, json.as_bytes())
        .map_err(|e| format!("Recovery write error: {e}"))
}

/// The recovery copy as raw JSON (it is migrated by the frontend, like any file), or null.
#[tauri::command]
fn read_recovery(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    match storage::read_recovery(&recovery_dir(&app)?).map_err(|e| format!("Read error: {e}"))? {
        Some(s) => serde_json::from_str(&s)
            .map(Some)
            .map_err(|e| format!("Parse error: {e}")),
        None => Ok(None),
    }
}

/// Remove the recovery copy (`keep`: move it aside instead of deleting).
#[tauri::command]
fn clear_recovery(app: tauri::AppHandle, keep: bool) -> Result<(), String> {
    storage::clear_recovery(&recovery_dir(&app)?, keep)
        .map_err(|e| format!("Recovery clear error: {e}"))
}

// ─── Live mirror: the latest unsaved project, kept outside the web view ───

/// The newest copy the web view sent (a JSON envelope `{path, project}`).
/// It lives in this process, so a WebView reload cannot lose it.
#[derive(Default)]
struct LiveMirror(Mutex<Option<String>>);

/// Store the unsaved project in memory and on disk (disk is best-effort:
/// the in-memory copy is already safe).
#[tauri::command]
fn mirror_project(
    app: tauri::AppHandle,
    live: tauri::State<LiveMirror>,
    project: Project,
    path: Option<String>,
) -> Result<(), String> {
    let envelope = serde_json::json!({ "path": path, "project": project }).to_string();
    *live.0.lock().map_err(|_| "Mirror is busy".to_string())? = Some(envelope.clone());
    storage::write_live(&recovery_dir(&app)?, envelope.as_bytes())
        .map_err(|e| format!("Live copy write error: {e}"))
}

/// The live copy: from memory (`"memory"`, a reload of the web view) or, after
/// a restart, from disk (`"disk"`). Null when nothing is unsaved.
#[tauri::command]
fn live_project(
    app: tauri::AppHandle,
    live: tauri::State<LiveMirror>,
) -> Result<Option<serde_json::Value>, String> {
    let in_memory = live.0.lock().map_err(|_| "Mirror is busy".to_string())?.clone();
    let (source, text) = match in_memory {
        Some(t) => ("memory", t),
        None => match storage::read_live(&recovery_dir(&app)?)
            .map_err(|e| format!("Read error: {e}"))?
        {
            Some(t) => ("disk", t),
            None => return Ok(None),
        },
    };
    let mut value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Parse error: {e}"))?;
    value["source"] = serde_json::Value::String(source.to_string());
    Ok(Some(value))
}

/// Forget the live copy (saved, closed or replaced on purpose).
#[tauri::command]
fn clear_live(app: tauri::AppHandle, live: tauri::State<LiveMirror>) -> Result<(), String> {
    *live.0.lock().map_err(|_| "Mirror is busy".to_string())? = None;
    storage::clear_live(&recovery_dir(&app)?).map_err(|e| format!("Live copy clear error: {e}"))
}

fn themes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("themes"))
        .map_err(|e| format!("No app data folder: {e}"))
}

/// Read a small text file the user picked (e.g. a colour theme to import).
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    storage::read_text_limited(&PathBuf::from(path), storage::MAX_THEME_BYTES)
        .map_err(|e| format!("Read error: {e}"))
}

/// The contents of every imported colour theme (the frontend validates them).
#[tauri::command]
fn list_user_themes(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    storage::list_themes(&themes_dir(&app)?).map_err(|e| format!("Could not read themes: {e}"))
}

#[tauri::command]
fn save_user_theme(app: tauri::AppHandle, file_name: String, contents: String) -> Result<(), String> {
    storage::write_theme(&themes_dir(&app)?, &file_name, contents.as_bytes())
        .map_err(|e| format!("Could not save theme: {e}"))
}

#[tauri::command]
fn delete_user_theme(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    storage::delete_theme(&themes_dir(&app)?, &file_name)
        .map_err(|e| format!("Could not remove theme: {e}"))
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ThemeFile {
    /// File name when saving, path relative to the chosen folder when scanning.
    name: String,
    contents: String,
}

/// Save many themes in one go (a folder import).
#[tauri::command]
fn save_user_themes(app: tauri::AppHandle, files: Vec<ThemeFile>) -> Result<usize, String> {
    let files: Vec<(String, Vec<u8>)> = files.into_iter().map(|f| (f.name, f.contents.into_bytes())).collect();
    storage::write_themes(&themes_dir(&app)?, &files).map_err(|e| format!("Could not save themes: {e}"))
}

/// Remove many themes in one go (e.g. a whole imported collection).
#[tauri::command]
fn delete_user_themes(app: tauri::AppHandle, file_names: Vec<String>) -> Result<usize, String> {
    storage::delete_themes(&themes_dir(&app)?, &file_names).map_err(|e| format!("Could not remove themes: {e}"))
}

/// Every .yaml/.yml/.json file under a folder the user picked (Base16/Base24/VS Code/Fabulator themes).
#[tauri::command]
fn read_theme_folder(dir: String) -> Result<Vec<ThemeFile>, String> {
    storage::read_theme_folder(&PathBuf::from(dir))
        .map(|v| v.into_iter().map(|(name, contents)| ThemeFile { name, contents }).collect())
        .map_err(|e| format!("Could not read the folder: {e}"))
}

/// Write an exported file (.docx, .epub, .md, .txt) to the path the user picked.
/// Atomic, so a failed export can never leave a half-written file behind.
#[tauri::command]
fn write_export(path: String, bytes: Vec<u8>) -> Result<(), String> {
    storage::write_atomic(&PathBuf::from(path), &bytes).map_err(|e| format!("Write error: {e}"))
}

/// One text file of a project folder (see src/lib/folder.ts). `path` is relative, with '/'.
#[derive(serde::Serialize, serde::Deserialize)]
struct FolderFile {
    path: String,
    text: String,
}

#[derive(serde::Serialize)]
struct FolderWriteReport {
    written: usize,
    unchanged: usize,
    removed: usize,
}

/// Write a project as a folder of Markdown files. Only files that changed are
/// rewritten; scene/note files that no longer belong to the project are removed.
#[tauri::command]
fn write_project_folder(dir: String, files: Vec<FolderFile>) -> Result<FolderWriteReport, String> {
    let files: Vec<(String, Vec<u8>)> = files.into_iter().map(|f| (f.path, f.text.into_bytes())).collect();
    storage::write_folder(&PathBuf::from(dir), &files)
        .map(|(written, unchanged, removed)| FolderWriteReport { written, unchanged, removed })
        .map_err(|e| format!("Could not write the folder: {e}"))
}

/// Read a project folder written by `write_project_folder` (or edited by hand).
#[tauri::command]
fn read_project_folder(dir: String) -> Result<Vec<FolderFile>, String> {
    storage::read_folder(&PathBuf::from(dir))
        .map(|files| files.into_iter().map(|(path, text)| FolderFile { path, text }).collect())
        .map_err(|e| format!("Could not read the folder: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LiveMirror::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            sample_project,
            load_project,
            backup_project,
            save_project,
            write_export,
            write_project_folder,
            read_project_folder,
            write_recovery,
            read_recovery,
            clear_recovery,
            mirror_project,
            live_project,
            clear_live,
            read_text_file,
            list_user_themes,
            save_user_theme,
            delete_user_theme,
            save_user_themes,
            delete_user_themes,
            read_theme_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
