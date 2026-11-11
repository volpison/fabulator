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

/// What opening a project file gives back.
#[derive(serde::Serialize)]
struct OpenResult {
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
fn open_project(path: String) -> Result<OpenResult, String> {
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
fn save_project(
    app: tauri::AppHandle,
    path: String,
    project: Project,
    force_backup: bool,
) -> Result<(), String> {
    let json =
        serde_json::to_string_pretty(&project).map_err(|e| format!("Serialize error: {e}"))?;
    let path = PathBuf::from(path);

    // A failed backup must never block saving your work.
    if let Err(e) = storage::backup_existing(&path, force_backup, storage::now_secs()) {
        eprintln!("backup failed for {}: {e}", path.display());
    }

    storage::write_atomic(&path, json.as_bytes()).map_err(|e| format!("Write error: {e}"))?;

    if let Ok(dir) = recovery_dir(&app) {
        let _ = storage::clear_legacy_recovery(&dir); // best effort
    }
    Ok(())
}

/// Where unsaved-work copies live (the app's own data folder).
fn recovery_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("recovery"))
        .map_err(|e| format!("No app data folder: {e}"))
}

// ─── Unsaved work: the latest copy of what would be lost if the app died now ───

/// The newest copy the web view sent (a JSON envelope `{path, project}`).
/// It lives in this process, so a WebView reload cannot lose it.
#[derive(Default)]
struct UnsavedWork(Mutex<Option<String>>);

/// Keep the unsaved project (whether or not it has a file yet) in memory and on
/// disk. Disk is best-effort: the in-memory copy is already safe.
#[tauri::command]
fn keep_unsaved(
    app: tauri::AppHandle,
    unsaved: tauri::State<UnsavedWork>,
    project: Project,
    path: Option<String>,
) -> Result<(), String> {
    let envelope = serde_json::json!({ "path": path, "project": project }).to_string();
    *unsaved.0.lock().map_err(|_| "Unsaved-work store is busy".to_string())? =
        Some(envelope.clone());
    storage::write_live(&recovery_dir(&app)?, envelope.as_bytes())
        .map_err(|e| format!("Could not write the recovery copy: {e}"))
}

/// The unsaved work to offer, or null: `{ path, project, source }` where `source`
/// is "memory" (the web view was reloaded: carry on silently), "disk" (the app
/// was restarted or crashed: ask first) or "legacy" (a recovery copy written by
/// an older version: ask first). The project is raw JSON; the frontend upgrades it.
#[tauri::command]
fn unsaved_work(
    app: tauri::AppHandle,
    unsaved: tauri::State<UnsavedWork>,
) -> Result<Option<serde_json::Value>, String> {
    let in_memory = unsaved.0.lock().map_err(|_| "Unsaved-work store is busy".to_string())?.clone();
    let chosen = storage::choose_unsaved(in_memory, &recovery_dir(&app)?)
        .map_err(|e| format!("Read error: {e}"))?;
    let Some((source, text)) = chosen else {
        return Ok(None);
    };
    let mut value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Parse error: {e}"))?;
    if !value.is_object() {
        return Err("The recovery copy is damaged.".to_string());
    }
    if source == storage::SOURCE_LEGACY {
        // Legacy copies are a bare project with no file.
        value = serde_json::json!({ "path": null, "project": value });
    }
    value["source"] = serde_json::Value::String(source.to_string());
    Ok(Some(value))
}

/// Forget the unsaved work (saved, closed or replaced on purpose). With
/// `keep_copy`, the newest copy is set aside as a single "discarded" file
/// instead of being deleted.
#[tauri::command]
fn discard_unsaved(
    app: tauri::AppHandle,
    unsaved: tauri::State<UnsavedWork>,
    keep_copy: bool,
) -> Result<(), String> {
    *unsaved.0.lock().map_err(|_| "Unsaved-work store is busy".to_string())? = None;
    storage::discard_unsaved(&recovery_dir(&app)?, keep_copy)
        .map_err(|e| format!("Could not discard the recovery copy: {e}"))
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
        .manage(UnsavedWork::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            sample_project,
            open_project,
            save_project,
            write_export,
            write_project_folder,
            read_project_folder,
            keep_unsaved,
            unsaved_work,
            discard_unsaved,
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
