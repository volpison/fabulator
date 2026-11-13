//! Applying a project *patch* to the unsaved copy Rust keeps.
//!
//! The web view sends what changed instead of the whole project. The format and the rules are
//! the same as `applyPatch` in `src/lib/patch.ts` (see the comment there):
//!
//! ```json
//! { "set":   { "title": "New" },
//!   "lists": { "scenes": { "upsert": [ {..} ], "remove": ["id"], "order": ["id"] } } }
//! ```
//!
//! Applying works on raw JSON, so it needs no knowledge of the project's fields and keeps
//! working when the schema grows. An `Err` means the patch does not fit the copy; the caller
//! then throws the copy away and asks for the whole project.

use serde_json::Value;
use std::collections::HashSet;

/// The project fields that are lists of items with an `id`.
pub const LISTS: [&str; 11] = [
    "chapters",
    "scenes",
    "issues",
    "pages",
    "acts",
    "script_scenes",
    "snapshots",
    "characters",
    "places",
    "notes",
    "plotlines",
];

fn id_of(item: &Value) -> Option<&str> {
    item.get("id").and_then(Value::as_str)
}

/// Apply `patch` to `base` (a project as raw JSON), in place.
pub fn apply(base: &mut Value, patch: &Value) -> Result<(), String> {
    let project = base
        .as_object_mut()
        .ok_or_else(|| "The kept copy is not an object".to_string())?;

    if let Some(set) = patch.get("set").and_then(Value::as_object) {
        for (key, value) in set {
            if LISTS.contains(&key.as_str()) {
                return Err(format!("\"{key}\" is a list; patch it under \"lists\""));
            }
            project.insert(key.clone(), value.clone());
        }
    }

    if let Some(lists) = patch.get("lists").and_then(Value::as_object) {
        for (name, list_patch) in lists {
            if !LISTS.contains(&name.as_str()) {
                return Err(format!("Unknown list \"{name}\""));
            }
            let entry = project
                .entry(name.clone())
                .or_insert_with(|| Value::Array(Vec::new()));
            let items = entry
                .as_array_mut()
                .ok_or_else(|| format!("\"{name}\" is not a list in the kept copy"))?;
            apply_list(items, list_patch)?;
        }
    }
    Ok(())
}

fn apply_list(items: &mut Vec<Value>, patch: &Value) -> Result<(), String> {
    if let Some(remove) = patch.get("remove").and_then(Value::as_array) {
        let gone: HashSet<&str> = remove.iter().filter_map(Value::as_str).collect();
        items.retain(|item| id_of(item).map_or(true, |id| !gone.contains(id)));
    }

    if let Some(upsert) = patch.get("upsert").and_then(Value::as_array) {
        for new_item in upsert {
            let id = id_of(new_item).ok_or_else(|| "An upserted item has no id".to_string())?;
            match items.iter().position(|item| id_of(item) == Some(id)) {
                Some(i) => items[i] = new_item.clone(),
                None => items.push(new_item.clone()),
            }
        }
    }

    if let Some(order) = patch.get("order").and_then(Value::as_array) {
        let mut pool: Vec<Value> = std::mem::take(items);
        let mut ordered: Vec<Value> = Vec::with_capacity(pool.len());
        for wanted in order.iter().filter_map(Value::as_str) {
            if let Some(i) = pool.iter().position(|item| id_of(item) == Some(wanted)) {
                ordered.push(pool.remove(i));
            }
        }
        if !pool.is_empty() {
            return Err("The order does not list every item".to_string());
        }
        *items = ordered;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn project() -> Value {
        json!({
            "title": "T", "premise": "",
            "scenes": [ {"id":"a","title":"A"}, {"id":"b","title":"B"}, {"id":"c","title":"C"} ],
            "chapters": [ {"id":"ch1","title":"One"} ]
        })
    }

    #[test]
    fn plain_fields_are_replaced() {
        let mut p = project();
        apply(&mut p, &json!({"set": {"title": "New", "genre": "Fable"}})).unwrap();
        assert_eq!(p["title"], "New");
        assert_eq!(p["genre"], "Fable");
        assert_eq!(p["premise"], "");
    }

    #[test]
    fn an_item_is_replaced_or_added() {
        let mut p = project();
        apply(&mut p, &json!({"lists": {"scenes": {"upsert": [
            {"id":"b","title":"B2"}, {"id":"d","title":"D"} ]}}})).unwrap();
        let ids: Vec<&str> = p["scenes"].as_array().unwrap().iter().map(|s| s["id"].as_str().unwrap()).collect();
        assert_eq!(ids, ["a", "b", "c", "d"]);
        assert_eq!(p["scenes"][1]["title"], "B2");
    }

    #[test]
    fn items_are_removed_and_reordered() {
        let mut p = project();
        apply(&mut p, &json!({"lists": {"scenes": {"remove": ["a"], "order": ["c", "b"]}}})).unwrap();
        assert_eq!(p["scenes"], json!([{"id":"c","title":"C"},{"id":"b","title":"B"}]));
        assert_eq!(p["chapters"].as_array().unwrap().len(), 1); // other lists untouched
    }

    #[test]
    fn an_order_that_misses_an_item_is_refused() {
        let mut p = project();
        let r = apply(&mut p, &json!({"lists": {"scenes": {"order": ["a", "b"]}}}));
        assert!(r.is_err());
    }

    #[test]
    fn nonsense_is_refused_not_applied() {
        let mut p = project();
        assert!(apply(&mut p, &json!({"set": {"scenes": []}})).is_err());
        assert!(apply(&mut p, &json!({"lists": {"title": {}}})).is_err());
        assert!(apply(&mut p, &json!({"lists": {"scenes": {"upsert": [{"title":"no id"}]}}})).is_err());
        assert!(apply(&mut json!(5), &json!({})).is_err());
    }

    #[test]
    fn an_empty_patch_changes_nothing() {
        let mut p = project();
        apply(&mut p, &json!({})).unwrap();
        assert_eq!(p, project());
    }
}
