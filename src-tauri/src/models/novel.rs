//! Novel documents: chapters and scenes.

use serde::{Deserialize, Serialize};

use super::shared::SceneTodo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub summary: String,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

fn default_status() -> String {
    "draft".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scene {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub content: String,
    pub chapter_id: String,
    /// Position inside its chapter (0-based, across all plotlines).
    pub order: u32,
    pub plotline_id: String,
    pub character_ids: Vec<String>,
    pub place_ids: Vec<String>,
    pub tags: Vec<String>,
    /// "idea", "draft", "revised" or "final".
    #[serde(default = "default_status")]
    pub status: String,
    /// A colour label id, or empty for none.
    #[serde(default)]
    pub color: String,
    /// Private notes about the scene.
    #[serde(default)]
    pub notes: String,
    /// Private to-do list for the scene.
    #[serde(default)]
    pub todos: Vec<SceneTodo>,
    /// When the scene happens inside the story (free text, e.g. "Day 3 evening").
    #[serde(default)]
    pub when: String,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}
