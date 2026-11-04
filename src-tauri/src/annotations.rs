//! Annotation storage: one JSON file per document in the app data folder.
//!
//! Files are named by the document's fingerprint (the PDF's own ID, read by pdf.js), so
//! annotations follow the document when it is moved or renamed, and the PDF itself is never
//! modified. The frontend owns the schema and validates what it reads; Rust only checks the key
//! and the size, and writes atomically (keeping the previous version as .bak).

use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::store::{read_json, write_json};
use crate::AppError;

const MAX_BYTES: usize = 20 * 1024 * 1024;

/// Fingerprints are hex strings (pdf.js: 32 hex chars); nothing else may become a file name.
pub fn valid_key(key: &str) -> bool {
    (16..=128).contains(&key.len()) && key.bytes().all(|b| b.is_ascii_hexdigit())
}

fn dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?
        .join("annotations"))
}

fn file<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<PathBuf, AppError> {
    if !valid_key(key) {
        return Err(AppError::InvalidInput("Invalid document key".into()));
    }
    Ok(dir(app)?.join(format!("{}.json", key.to_ascii_lowercase())))
}

/// The stored annotations, or null when there are none (or the file is unreadable, in which
/// case the backup is tried).
#[tauri::command]
pub fn annotations_load<R: Runtime>(app: AppHandle<R>, key: String) -> Result<Value, AppError> {
    let path = file(&app, &key)?;
    Ok(read_json::<Value>(&path)
        .or_else(|| read_json::<Value>(&path.with_extension("json.bak")))
        .unwrap_or(Value::Null))
}

#[tauri::command]
pub fn annotations_save<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    data: Value,
) -> Result<(), AppError> {
    let path = file(&app, &key)?;
    if !data.is_object() {
        return Err(AppError::InvalidInput(
            "Annotations must be an object".into(),
        ));
    }
    if path.exists() {
        let _ = fs::copy(&path, path.with_extension("json.bak"));
    }
    write_json(&path, &data, MAX_BYTES)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_hex_only() {
        assert!(valid_key("0123456789abcdef0123456789ABCDEF"));
        assert!(!valid_key("../../etc/passwd"));
        assert!(!valid_key("abc"));
        assert!(!valid_key("0123456789abcdef0123456789abcdeg"));
    }
}
