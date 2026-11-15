mod commands;
mod models;
mod patch;
mod storage;

use commands::{folder, project, themes, unsaved};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(unsaved::UnsavedWork::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            project::sample_project,
            project::open_project,
            project::save_project,
            project::write_export,
            folder::write_project_folder,
            folder::read_project_folder,
            unsaved::keep_unsaved,
            unsaved::keep_unsaved_changes,
            unsaved::save_unsaved,
            unsaved::settle_unsaved,
            unsaved::unsaved_work,
            unsaved::discard_unsaved,
            themes::read_text_file,
            themes::list_user_themes,
            themes::save_user_theme,
            themes::delete_user_theme,
            themes::save_user_themes,
            themes::delete_user_themes,
            themes::read_theme_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
