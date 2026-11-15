//! Screenplay documents: acts, scenes and their elements.

use serde::{Deserialize, Serialize};

use super::shared::SceneTodo;

/// A screenplay act (like a chapter): ordered, groups scenes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Act {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// One element of a screenplay scene. `kind` is "action", "dialogue", "transition" or "note".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptElement {
    pub id: String,
    pub kind: String,
    /// Dialogue: a Character id.
    #[serde(default)]
    pub speaker_id: String,
    /// Dialogue: "V.O.", "O.S."… (free text).
    #[serde(default)]
    pub extension: String,
    /// Dialogue: a short direction, without brackets.
    #[serde(default)]
    pub parenthetical: String,
    #[serde(default)]
    pub text: String,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// A screenplay scene: a slug line and its elements. The shared fields behave exactly as on a novel's scene.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptScene {
    pub id: String,
    pub act_id: String,
    /// Position inside its act (0-based).
    pub order: u32,
    #[serde(default)]
    pub title: String,
    /// "INT", "EXT", "INT/EXT" or empty.
    #[serde(default)]
    pub int_ext: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub time: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub elements: Vec<ScriptElement>,
    #[serde(default = "default_scene_status")]
    pub status: String,
    #[serde(default)]
    pub plotline_id: String,
    #[serde(default)]
    pub character_ids: Vec<String>,
    #[serde(default)]
    pub place_ids: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub todos: Vec<SceneTodo>,
    #[serde(default)]
    pub when: String,
    /// Fields this version does not know (written by a newer Fabulator): kept and written back.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

fn default_scene_status() -> String {
    "idea".into()
}
