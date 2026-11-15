//! Commands for the project-as-a-folder format (Markdown files for git and any editor).

use std::path::PathBuf;

use crate::storage;

/// One text file of a project folder (see src/lib/folder.ts). `path` is relative, with '/'.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct FolderFile {
    path: String,
    text: String,
}

#[derive(serde::Serialize)]
pub struct FolderWriteReport {
    written: usize,
    unchanged: usize,
    removed: usize,
}

/// Write a project as a folder of Markdown files. Only files that changed are
/// rewritten; scene/note files that no longer belong to the project are removed.
#[tauri::command]
pub fn write_project_folder(dir: String, files: Vec<FolderFile>) -> Result<FolderWriteReport, String> {
    let files: Vec<(String, Vec<u8>)> = files.into_iter().map(|f| (f.path, f.text.into_bytes())).collect();
    storage::write_folder(&PathBuf::from(dir), &files)
        .map(|(written, unchanged, removed)| FolderWriteReport { written, unchanged, removed })
        .map_err(|e| format!("Could not write the folder: {e}"))
}

/// Read a project folder written by `write_project_folder` (or edited by hand).
#[tauri::command]
pub fn read_project_folder(dir: String) -> Result<Vec<FolderFile>, String> {
    storage::read_folder(&PathBuf::from(dir))
        .map(|files| files.into_iter().map(|(path, text)| FolderFile { path, text }).collect())
        .map_err(|e| format!("Could not read the folder: {e}"))
}
