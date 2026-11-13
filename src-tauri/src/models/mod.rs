use serde::{Deserialize, Serialize};

/// File-format version written to every project. Keep in sync with
/// CURRENT_SCHEMA_VERSION in src/lib/migrate.ts (which upgrades old files).
pub const SCHEMA_VERSION: u32 = 10;

/// The format of a project written before formats existed. The frontend decides what formats
/// exist (src/lib/formats.ts); Rust stores whatever the file says and never interprets it.
pub const DEFAULT_STORY_FORMAT: &str = "novel";

fn default_story_format() -> String {
    DEFAULT_STORY_FORMAT.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub schema_version: u32,
    /// What kind of document this is: "novel", later "comic", "screenplay".
    #[serde(default = "default_story_format")]
    pub story_format: String,
    pub id: String,
    pub title: String,
    pub premise: String,
    pub genre: String,
    pub theme: String,
    /// Ordered: position in the vec is the chapter's position in the book.
    pub chapters: Vec<Chapter>,
    pub scenes: Vec<Scene>,
    /// Comic documents only (empty, and left out of the file, in a novel): issues in order and their pages.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub issues: Vec<Issue>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pages: Vec<ComicPage>,
    /// Screenplay documents only (empty, and left out of the file, elsewhere): acts in order and their scenes.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub acts: Vec<Act>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub script_scenes: Vec<ScriptScene>,
    /// Comic only: "plot-first" or "full". Rust stores it as written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script_style: Option<String>,
    /// Saved scene versions (manual, auto and safety snapshots).
    #[serde(default)]
    pub snapshots: Vec<Snapshot>,
    pub characters: Vec<Character>,
    pub places: Vec<Place>,
    pub notes: Vec<Note>,
    pub plotlines: Vec<Plotline>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub summary: String,
}

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

/// A screenplay act (like a chapter): ordered, groups scenes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Act {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
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
}

fn default_scene_status() -> String {
    "idea".into()
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneTodo {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub done: bool,
}

fn default_status() -> String {
    "draft".into()
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plotline {
    pub id: String,
    pub name: String,
    pub color: String,
}

impl Project {
    /// Sample project: The Boy Who Cried Wolf
    pub fn sample() -> Self {
        Project {
            schema_version: SCHEMA_VERSION,
            story_format: DEFAULT_STORY_FORMAT.into(),
            id: "proj-boy-who-cried-wolf".into(),
            chapters: (1..=6)
                .map(|n| Chapter {
                    id: format!("ch-{n}"),
                    title: format!("Chapter {n}"),
                    summary: String::new(),
                })
                .collect(),
            title: "The Boy Who Cried Wolf".into(),
            premise: "A bored shepherd boy learns the cost of lying when a real threat appears and no one believes him.".into(),
            genre: "Fable".into(),
            theme: "Trust, once broken, is hard to restore. Short-sighted amusement can destroy what matters most.".into(),
            plotlines: vec![
                Plotline {
                    id: "pl-main".into(),
                    name: "Main Plot".into(),
                    color: "#3b82f6".into(),
                },
                Plotline {
                    id: "pl-boy".into(),
                    name: "The Boy".into(),
                    color: "#f59e0b".into(),
                },
                Plotline {
                    id: "pl-village".into(),
                    name: "The Village".into(),
                    color: "#64748b".into(),
                },
            ],
            snapshots: vec![],
            characters: vec![
                Character {
                    id: "char-boy".into(),
                    name: "The Shepherd Boy".into(),
                    aliases: vec!["the boy".into(), "shepherd boy".into()],
                    description: "A young shepherd left alone on the hillside with the village flock. Often left unnamed to keep the fable universal.".into(),
                    role: "Protagonist / Catalyst of his own downfall".into(),
                    category: "Main".into(),
                    traits: vec![
                        "Energetic".into(),
                        "Clever but immature".into(),
                        "Attention-seeking".into(),
                        "Overly confident".into(),
                    ],
                    notes: "External Goal: Entertainment and validation — trapped in a mind-numbing, isolated job and craves a break from the monotony.\n\nInternal Flaw: Short-sightedness and a lack of empathy. He prioritizes immediate amusement over his long-term reputation and the safety of the village's livelihood.".into(),
                },
                Character {
                    id: "char-villagers".into(),
                    name: "The Villagers".into(),
                    aliases: vec!["villagers".into()],
                    description: "The people of the village who depend on the sheep and respond when the alarm is raised.".into(),
                    role: "Supporting / Collective antagonist of trust".into(),
                    category: "Supporting".into(),
                    traits: vec!["Dutiful".into(), "Initially trusting".into(), "Increasingly wary".into()],
                    notes: "They represent the social contract the boy breaks. Their final refusal to help is the consequence of his lies.".into(),
                },
                Character {
                    id: "char-wolf".into(),
                    name: "The Wolf".into(),
                    aliases: vec!["wolf".into()],
                    description: "A real predator that finally appears after the boy's false alarms have destroyed his credibility.".into(),
                    role: "Antagonist / Force of nature".into(),
                    category: "Main".into(),
                    traits: vec!["Silent".into(), "Hungry".into(), "Inevitable".into()],
                    notes: "The wolf is less a character with motive and more the embodiment of the real danger the boy was supposed to watch for.".into(),
                },
            ],
            places: vec![
                Place {
                    id: "place-pasture".into(),
                    name: "The North Pasture".into(),
                    aliases: vec!["pasture".into(), "the hillside".into()],
                    description: "An isolated hillside where the shepherd boy watches the flock. Quiet, exposed, and far from the village.".into(),
                    location: "Above the village, on the open slope".into(),
                    notes: "The setting of boredom, the false cries, and the final real attack.".into(),
                },
                Place {
                    id: "place-village".into(),
                    name: "The Village Square".into(),
                    aliases: vec!["village".into()],
                    description: "The heart of the village. Where people work, gather, and from which they run when they hear the cry of \"Wolf!\".".into(),
                    location: "Down in the valley".into(),
                    notes: "The place that stops responding after the second false alarm.".into(),
                },
                Place {
                    id: "place-woods".into(),
                    name: "The Edge of the Woods".into(),
                    aliases: vec!["woods".into(), "treeline".into()],
                    description: "The dark treeline from which the real wolf eventually emerges.".into(),
                    location: "Bordering the north pasture".into(),
                    notes: String::new(),
                },
            ],
            notes: vec![
                Note {
                    id: "note-theme".into(),
                    title: "Core theme".into(),
                    content: "Trust is a form of social currency. The boy spends it for entertainment and discovers too late that he has none left when he truly needs it.".into(),
                    tags: vec!["Theme".into()],
                },
                Note {
                    id: "note-pov".into(),
                    title: "Point of View".into(),
                    content: "Third-Person Limited — focusing on the boy's internal boredom, amusement, and later panic.".into(),
                    tags: vec!["Craft".into(), "POV".into()],
                },
                Note {
                    id: "note-tension".into(),
                    title: "Tension progression".into(),
                    content: "Scene 1: Low (boredom)\nScenes 2–3: Comedic / anxious (false alarms)\nScenes 4–6: High / terror (real wolf + silence)".into(),
                    tags: vec!["Structure".into()],
                },
            ],
            scenes: vec![
                // Act I – The Setup
                Scene {
                    id: "sc-1".into(),
                    title: "The Monotony".into(),
                    summary: "Introduce the isolated pasture, the weight of the chore, and the boy's growing desperation for excitement.".into(),
                    content: "The sun hung heavy over the north pasture. The Shepherd Boy sat on the same flat stone he had sat on every day that summer, watching the same sheep crop the same dry grass.\n\nDown in the village the sound of voices and tools carried faintly on the wind. Up here there was only the occasional bleat and the endless, empty sky.\n\nHe was supposed to keep the flock safe. The whole village depended on these animals. But nothing ever happened. Nothing ever changed. And the boredom had begun to feel like a physical weight.".into(),
                    chapter_id: "ch-1".into(),
                    order: 0,
                    plotline_id: "pl-main".into(),
                    character_ids: vec!["char-boy".into()],
                    place_ids: vec!["place-pasture".into()],
                    tags: vec!["Act I".into(), "Setup".into(), "Tension: Low".into()],
                    status: "draft".into(),
                    color: String::new(),
                    notes: String::new(),
                    todos: vec![],
                    when: String::new(),
                },
                // Act II – The Deceptions
                Scene {
                    id: "sc-2".into(),
                    title: "The First Cry".into(),
                    summary: "The boy experiments with his power over the village. The false alarm works perfectly.".into(),
                    content: "The idea arrived fully formed, bright and irresistible.\n\nHe stood up on the stone, cupped his hands around his mouth, and shouted with all the terror he could invent:\n\n\"Wolf! Wolf! A wolf is after the sheep!\"\n\nFor a moment the hillside was still. Then, from the village below, came the sound of running feet, shouted orders, the clatter of tools dropped in haste. Men and women appeared on the path, breathless, some carrying sticks, some knives.\n\nThey reached the pasture ready for a fight — and found only the boy, doubled over with laughter.\n\nThe relief on their faces curdled into anger. They scolded him, warned him, then trudged back down the hill. The boy watched them go, still grinning. It had been the most exciting afternoon of the entire summer.".into(),
                    chapter_id: "ch-2".into(),
                    order: 0,
                    plotline_id: "pl-main".into(),
                    character_ids: vec!["char-boy".into(), "char-villagers".into()],
                    place_ids: vec!["place-pasture".into(), "place-village".into()],
                    tags: vec!["Act II".into(), "Rising Action".into(), "Tension: Comedic".into()],
                    status: "draft".into(),
                    color: String::new(),
                    notes: String::new(),
                    todos: vec![],
                    when: String::new(),
                },
                Scene {
                    id: "sc-3".into(),
                    title: "The Second Cry".into(),
                    summary: "The second lie. The villagers warn him about his behavior; trust begins to fracture.".into(),
                    content: "Days later the boredom returned, heavier than before.\n\nHe told himself he would only do it once more. Just once.\n\n\"Wolf! Wolf!\"\n\nThey came again — slower this time, fewer of them, faces already tight with suspicion. When they found the pasture peaceful and the boy laughing, the scolding was sharper.\n\n\"Lie to us again,\" one of the men said, \"and we will not come.\"\n\nThe boy nodded, still smiling, and watched them leave. He did not believe them. Why would they risk the sheep?".into(),
                    chapter_id: "ch-3".into(),
                    order: 0,
                    plotline_id: "pl-main".into(),
                    character_ids: vec!["char-boy".into(), "char-villagers".into()],
                    place_ids: vec!["place-pasture".into(), "place-village".into()],
                    tags: vec!["Act II".into(), "Rising Action".into(), "Tension: Anxious".into()],
                    status: "draft".into(),
                    color: String::new(),
                    notes: String::new(),
                    todos: vec![],
                    when: String::new(),
                },
                // Act III – The Reckoning
                Scene {
                    id: "sc-4".into(),
                    title: "The Shadow".into(),
                    summary: "Reality strikes. A real apex predator arrives. The boy realizes his past actions have stripped him of his armor.".into(),
                    content: "It came from the edge of the woods without a sound.\n\nAt first the boy thought it was another sheep straying too far. Then the shape resolved itself — low, grey, deliberate — and the blood in his veins turned to ice.\n\nA wolf. A real one.\n\nThe animal moved with the calm certainty of something that had already decided how this would end. The sheep began to scatter, bleating in panic.\n\nThe boy scrambled to his feet, voice cracking as he screamed the only word that mattered:\n\n\"Wolf! Wolf! Please — a wolf!\"".into(),
                    chapter_id: "ch-4".into(),
                    order: 0,
                    plotline_id: "pl-main".into(),
                    character_ids: vec!["char-boy".into(), "char-wolf".into()],
                    place_ids: vec!["place-pasture".into(), "place-woods".into()],
                    tags: vec!["Act III".into(), "Climax".into(), "Tension: High".into()],
                    status: "draft".into(),
                    color: String::new(),
                    notes: String::new(),
                    todos: vec![],
                    when: String::new(),
                },
                Scene {
                    id: "sc-5".into(),
                    title: "The Silent Valley".into(),
                    summary: "The boy shouts into the void. The village stays quiet. The physical and metaphorical loss begins.".into(),
                    content: "He screamed until his throat was raw.\n\nDown in the village, people paused at their work, listened for a moment, then shook their heads and returned to what they were doing.\n\n\"It's the boy again,\" someone said.\n\nNo one climbed the path.\n\nOn the hillside the wolf was already among the flock.".into(),
                    chapter_id: "ch-5".into(),
                    order: 0,
                    plotline_id: "pl-main".into(),
                    character_ids: vec!["char-boy".into(), "char-villagers".into(), "char-wolf".into()],
                    place_ids: vec!["place-pasture".into(), "place-village".into()],
                    tags: vec!["Act III".into(), "Climax".into(), "Tension: Terror".into()],
                    status: "draft".into(),
                    color: String::new(),
                    notes: String::new(),
                    todos: vec![],
                    when: String::new(),
                },
                Scene {
                    id: "sc-6".into(),
                    title: "The Aftermath".into(),
                    summary: "The wolf destroys the flock. The boy is left alone in the ruins of his credibility.".into(),
                    content: "When the villagers finally came — too late, and only out of lingering duty — the pasture was quiet again.\n\nWhat remained of the flock was scattered or gone. The wolf had vanished back into the woods. And the Shepherd Boy sat on his stone, staring at nothing, the last of his shouts still echoing in his own ears.\n\nNo one struck him. No one needed to.\n\nHe had already lost the only thing that had ever protected him: the belief that when he called, someone would answer.".into(),
                    chapter_id: "ch-6".into(),
                    order: 0,
                    plotline_id: "pl-main".into(),
                    character_ids: vec!["char-boy".into(), "char-villagers".into()],
                    place_ids: vec!["place-pasture".into()],
                    tags: vec!["Act III".into(), "Resolution".into(), "Tension: Aftermath".into()],
                    status: "draft".into(),
                    color: String::new(),
                    notes: String::new(),
                    todos: vec![],
                    when: String::new(),
                },
            ],
            issues: vec![],
            pages: vec![],
            acts: vec![],
            script_scenes: vec![],
            script_style: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sample_is_a_novel_at_the_current_version() {
        let p = Project::sample();
        assert_eq!(p.story_format, "novel");
        assert_eq!(p.schema_version, SCHEMA_VERSION);
    }

    #[test]
    fn a_novel_file_has_no_comic_fields_and_a_comic_keeps_its_pages() {
        // A novel is written without the comic fields (its files do not change).
        let novel = serde_json::to_value(Project::sample()).unwrap();
        assert!(novel.get("issues").is_none() && novel.get("pages").is_none() && novel.get("script_style").is_none());

        // A comic's pages, panels and lines round-trip, and missing optional fields get defaults.
        let mut json = novel.clone();
        json["story_format"] = "comic".into();
        json["script_style"] = "plot-first".into();
        json["issues"] = serde_json::json!([{ "id": "is-1", "title": "Issue 1" }]);
        json["pages"] = serde_json::json!([{
            "id": "pg-1", "issue_id": "is-1", "order": 0, "plot": "The bridge collapses.",
            "panels": [{ "id": "pn-1", "description": "Wide shot", "lines": [
                { "id": "ln-1", "kind": "dialogue", "speaker_id": "char-boy", "text": "Wolf!" } ] }]
        }]);
        let comic: Project = serde_json::from_value(json).unwrap();
        assert_eq!(comic.issues.len(), 1);
        assert_eq!(comic.pages[0].stage, "plot");
        assert_eq!(comic.pages[0].panels[0].lines[0].text, "Wolf!");
        assert_eq!(comic.script_style.as_deref(), Some("plot-first"));
        let back = serde_json::to_value(&comic).unwrap();
        assert_eq!(back["pages"][0]["panels"][0]["lines"][0]["speaker_id"], "char-boy");
    }

    #[test]
    fn a_file_without_a_format_is_a_novel_and_another_format_is_kept_as_written() {
        let mut json = serde_json::to_value(Project::sample()).unwrap();
        json.as_object_mut().unwrap().remove("story_format");
        let old: Project = serde_json::from_value(json.clone()).unwrap();
        assert_eq!(old.story_format, "novel");

        json["story_format"] = "comic".into();
        let comic: Project = serde_json::from_value(json).unwrap();
        assert_eq!(comic.story_format, "comic"); // Rust passes it through untouched
        let back = serde_json::to_value(&comic).unwrap();
        assert_eq!(back["story_format"], "comic");
    }
}
