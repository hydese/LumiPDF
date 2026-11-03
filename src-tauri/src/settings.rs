//! User settings, stored as JSON in the app's config folder.
//!
//! Rust only stores and returns the document; the frontend owns the schema and validates every
//! value it reads (unknown or invalid fields fall back to defaults there). Writes are atomic:
//! the new file is written next to the old one and renamed over it, so a crash never leaves a
//! half-written settings file.

use std::path::Path;

use serde_json::Value;
use tauri::{AppHandle, Runtime};

use crate::store::{config_file, read_json, write_json};
use crate::AppError;

const FILE_NAME: &str = "settings.json";
/// Settings are small; anything bigger is not ours.
const MAX_BYTES: usize = 256 * 1024;

/// Reads the settings document; a missing or unreadable file yields an empty object.
pub fn read_settings(path: &Path) -> Value {
    read_json::<Value>(path)
        .filter(Value::is_object)
        .unwrap_or_else(|| Value::Object(Default::default()))
}

/// Writes `value` atomically to `path`, creating the folder if needed.
pub fn write_settings(path: &Path, value: &Value) -> Result<(), AppError> {
    if !value.is_object() {
        return Err(AppError::InvalidInput(
            "Settings must be a JSON object".into(),
        ));
    }
    write_json(path, value, MAX_BYTES)
}

#[tauri::command]
pub fn load_settings<R: Runtime>(app: AppHandle<R>) -> Result<Value, AppError> {
    Ok(read_settings(&config_file(&app, FILE_NAME)?))
}

#[tauri::command]
pub fn save_settings<R: Runtime>(app: AppHandle<R>, settings: Value) -> Result<(), AppError> {
    write_settings(&config_file(&app, FILE_NAME)?, &settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    #[test]
    fn round_trips_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join(FILE_NAME);
        let value = json!({ "reading": { "theme": "night-paper", "darkEnabled": true } });
        write_settings(&path, &value).unwrap();
        assert_eq!(read_settings(&path), value);
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn missing_or_corrupt_file_gives_empty_object() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(FILE_NAME);
        assert_eq!(read_settings(&path), json!({}));
        fs::write(&path, "{ not json").unwrap();
        assert_eq!(read_settings(&path), json!({}));
        fs::write(&path, "[1, 2]").unwrap();
        assert_eq!(read_settings(&path), json!({}));
    }

    #[test]
    fn rejects_non_objects_and_huge_documents() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(FILE_NAME);
        assert!(write_settings(&path, &json!([1])).is_err());
        let huge = json!({ "x": "a".repeat(MAX_BYTES) });
        assert!(write_settings(&path, &huge).is_err());
    }
}
