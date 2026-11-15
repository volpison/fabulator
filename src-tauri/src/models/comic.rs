//! Comic documents: issues, pages, panels and lines.

use serde::{Deserialize, Serialize};

use super::shared::SceneTodo;

/// A comic issue (like a chapter): ordered, groups pages.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
}

/// One balloon, caption or sound effect. `kind` is "dialogue", "caption", "thought" or "sfx".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicLine {
    pub id: String,
    pub kind: String,
    /// A Character id, or empty for a caption or sound effect.
    #[serde(default)]
    pub speaker_id: String,
    #[serde(default)]
    pub text: String,
    /// Lettering note ("off-panel", "small").
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicPanel {
    pub id: String,
    /// What the artist should draw.
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub lines: Vec<ComicLine>,
}

/// A comic page. The shared fields behave exactly as on a novel's scene.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicPage {
    pub id: String,
    pub issue_id: String,
    /// Position inside its issue (0-based); the page number is order + 1.
    pub order: u32,
    #[serde(default)]
    pub title: String,
    /// What happens on the page, in the writer's own words (the plot-first text).
    #[serde(default)]
    pub plot: String,
    /// Planned layout, free text ("3 tiers: 2/1/3", "splash").
    #[serde(default)]
    pub layout: String,
    #[serde(default)]
    pub panels: Vec<ComicPanel>,
    /// "plot", "art", "dialogue" or "lettered".
    #[serde(default = "default_stage")]
    pub stage: String,
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
}

fn default_stage() -> String {
    "plot".into()
}
