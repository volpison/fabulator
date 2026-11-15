//! The world every format shares: characters, places, notes, plotlines, todos and snapshots.

use serde::{Deserialize, Serialize};

use super::comic::ComicPage;
use super::screenplay::ScriptScene;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneTodo {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub done: bool,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// A saved version of a scene. `kind` is "manual", "auto" or "safety".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub scene_id: String,
    pub kind: String,
    pub label: String,
    /// Milliseconds since the Unix epoch.
    pub created_at: u64,
    pub title: String,
    pub summary: String,
    pub content: String,
    pub chapter_id: String,
    pub plotline_id: String,
    pub character_ids: Vec<String>,
    pub place_ids: Vec<String>,
    pub tags: Vec<String>,
    /// Comics: the whole page as it was (then `scene_id` holds the page id and `content` is empty).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<ComicPage>,
    /// Screenplays: the whole scene as it was (then `scene_id` holds the scene id and `content` is empty).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script_scene: Option<ScriptScene>,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    pub description: String,
    pub role: String,
    pub category: String,
    pub traits: Vec<String>,
    pub notes: String,
    /// Abilities this character has (ids of `Project.abilities`); left out of the file when empty.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ability_ids: Vec<String>,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// Something a character can do (a power, skill, spell, trade...). Part of the shared world.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ability {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    pub description: String,
    pub notes: String,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Place {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    pub description: String,
    pub location: String,
    pub notes: String,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plotline {
    pub id: String,
    pub name: String,
    pub color: String,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}
