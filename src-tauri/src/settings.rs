//! User settings, stored as JSON in the app's config folder.
//!
//! Rust only stores and returns the document; the frontend owns the schema and validates every
//! value it reads (unknown or invalid fields fall back to defaults there). Writes are atomic:
//! the new file is written next to the old one and renamed over it, so a crash never leaves a
//! half-written settings file.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::AppError;

const FILE_NAME: &str = "settings.json";
/// Settings are small; anything bigger is not ours.
const MAX_BYTES: usize = 256 * 1024;

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    Ok(dir.join(FILE_NAME))
}

/// Reads the settings document; a missing or unreadable file yields an empty object.
pub fn read_settings(path: &Path) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
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
    let text =
        serde_json::to_string_pretty(value).map_err(|e| AppError::InvalidInput(e.to_string()))?;
    if text.len() > MAX_BYTES {
        return Err(AppError::InvalidInput("Settings are too large".into()));
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

#[tauri::command]
pub fn load_settings<R: Runtime>(app: AppHandle<R>) -> Result<Value, AppError> {
    Ok(read_settings(&settings_path(&app)?))
}

#[tauri::command]
pub fn save_settings<R: Runtime>(app: AppHandle<R>, settings: Value) -> Result<(), AppError> {
    write_settings(&settings_path(&app)?, &settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
