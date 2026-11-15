//! Commands for unsaved work: the copy of the project that Rust keeps in memory (and on disk
//! while it has unsaved changes), so a reload or a crash cannot lose it.

use std::sync::Mutex;

use serde::Deserialize;

use crate::models::Project;
use crate::{patch, storage};

use super::project::write_project_file;
use super::recovery_dir;

// ─── Unsaved work: the latest copy of what would be lost if the app died now ───

/// The newest copy the web view sent. It lives in this process, so a WebView reload
/// cannot lose it.
struct Stored {
    /// `{ path, project }`; the project is kept as raw JSON so small patches can be applied to it.
    envelope: serde_json::Value,
    /// Counts every change to the copy. A patch only applies on top of the revision it was made for.
    revision: u64,
    /// True while the copy has changes that are not in the file. Only then is it offered for
    /// recovery and written to disk; a clean copy is just held so later changes and saves are small.
    dirty: bool,
}

#[derive(Default)]
pub struct UnsavedWork(Mutex<Option<Stored>>);

/// Write the kept copy to disk. Best-effort for the caller: the in-memory copy is already safe.
fn write_live_copy(app: &tauri::AppHandle, envelope: &serde_json::Value) -> Result<(), String> {
    storage::write_live(&recovery_dir(app)?, envelope.to_string().as_bytes())
        .map_err(|e| format!("Could not write the recovery copy: {e}"))
}

/// Keep the whole unsaved project (whether or not it has a file yet) in memory and on
/// disk. Returns the copy's new revision.
#[tauri::command]
pub fn keep_unsaved(
    app: tauri::AppHandle,
    unsaved: tauri::State<UnsavedWork>,
    project: Project,
    path: Option<String>,
    dirty: bool,
) -> Result<u64, String> {
    let envelope = serde_json::json!({ "path": path, "project": project });
    let revision = {
        let mut guard = unsaved.0.lock().map_err(|_| "Unsaved-work store is busy".to_string())?;
        let revision = guard.as_ref().map_or(1, |s| s.revision + 1);
        *guard = Some(Stored { envelope: envelope.clone(), revision, dirty });
        revision
    };
    if dirty {
        write_live_copy(&app, &envelope)?;
    }
    Ok(revision)
}

/// Apply a small change (see `patch.rs`) on top of revision `base` of the kept copy.
/// Returns the new revision, or null when it cannot be applied (nothing kept, another
/// revision, or a patch that does not fit): the kept copy is then dropped and the web
/// view sends the whole project instead.
#[tauri::command]
pub fn keep_unsaved_changes(
    app: tauri::AppHandle,
    unsaved: tauri::State<UnsavedWork>,
    base: u64,
    patch: serde_json::Value,
    path: Option<String>,
    dirty: bool,
) -> Result<Option<u64>, String> {
    let (revision, envelope) = {
        let mut guard = unsaved.0.lock().map_err(|_| "Unsaved-work store is busy".to_string())?;
        let Some(stored) = guard.as_mut() else {
            return Ok(None);
        };
        if stored.revision != base {
            return Ok(None);
        }
        let applied = stored
            .envelope
            .get_mut("project")
            .map(|project| patch::apply(project, &patch).is_ok())
            .unwrap_or(false);
        if !applied {
            *guard = None; // possibly half-applied: never trust it again
            return Ok(None);
        }
        let Some(stored) = guard.as_mut() else {
            return Ok(None);
        };
        stored.envelope["path"] = serde_json::json!(path);
        stored.revision += 1;
        stored.dirty = stored.dirty || dirty; // a change can only raise the flag; `settle_unsaved` lowers it
        (stored.revision, stored.dirty.then(|| stored.envelope.clone()))
    };
    if let Some(envelope) = envelope {
        write_live_copy(&app, &envelope)?;
    }
    Ok(Some(revision))
}

/// Save the kept unsaved copy at `revision` to `path`, exactly like `save_project`, without
/// the web view sending the project again. Returns false (and writes nothing) when the kept
/// copy is missing or at another revision: the caller then saves with `save_project`.
#[tauri::command]
pub fn save_unsaved(
    app: tauri::AppHandle,
    unsaved: tauri::State<UnsavedWork>,
    path: String,
    revision: u64,
    force_backup: bool,
) -> Result<bool, String> {
    let json = {
        let guard = unsaved.0.lock().map_err(|_| "Unsaved-work store is busy".to_string())?;
        let Some(stored) = guard.as_ref() else {
            return Ok(false);
        };
        if stored.revision != revision {
            return Ok(false);
        }
        let raw = stored
            .envelope
            .get("project")
            .ok_or_else(|| "The kept copy has no project".to_string())?;
        // Going through `Project` validates the copy and writes the exact same format as `save_project`.
        let project = Project::deserialize(raw)
            .map_err(|e| format!("The kept copy is not a valid project: {e}"))?;
        serde_json::to_string_pretty(&project).map_err(|e| format!("Serialize error: {e}"))?
    };
    write_project_file(&app, &path, &json, force_backup)?;
    Ok(true)
}

/// The unsaved work to offer, or null: `{ path, project, source }` where `source`
/// is "memory" (the web view was reloaded: carry on silently), "disk" (the app
/// was restarted or crashed: ask first) or "legacy" (a recovery copy written by
/// an older version: ask first). The project is raw JSON; the frontend upgrades it.
#[tauri::command]
pub fn unsaved_work(
    app: tauri::AppHandle,
    unsaved: tauri::State<UnsavedWork>,
) -> Result<Option<serde_json::Value>, String> {
    let in_memory = unsaved
        .0
        .lock()
        .map_err(|_| "Unsaved-work store is busy".to_string())?
        .as_ref()
        .filter(|s| s.dirty) // a clean copy is not unsaved work
        .map(|s| s.envelope.to_string());
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

/// Everything is saved: the copy stays in memory (so later changes can be small) but it is no
/// longer unsaved work, and the recovery copies on disk are removed.
#[tauri::command]
pub fn settle_unsaved(app: tauri::AppHandle, unsaved: tauri::State<UnsavedWork>) -> Result<(), String> {
    if let Some(stored) = unsaved.0.lock().map_err(|_| "Unsaved-work store is busy".to_string())?.as_mut() {
        stored.dirty = false;
    }
    storage::discard_unsaved(&recovery_dir(&app)?, false)
        .map_err(|e| format!("Could not remove the recovery copy: {e}"))
}

/// Forget the unsaved work (saved, closed or replaced on purpose). With
/// `keep_copy`, the newest copy is set aside as a single "discarded" file
/// instead of being deleted.
#[tauri::command]
pub fn discard_unsaved(
    app: tauri::AppHandle,
    unsaved: tauri::State<UnsavedWork>,
    keep_copy: bool,
) -> Result<(), String> {
    *unsaved.0.lock().map_err(|_| "Unsaved-work store is busy".to_string())? = None;
    storage::discard_unsaved(&recovery_dir(&app)?, keep_copy)
        .map_err(|e| format!("Could not discard the recovery copy: {e}"))
}
