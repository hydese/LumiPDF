//! Small JSON documents in the app's config folder (settings, library).
//!
//! Writes are atomic: the new file is written next to the old one and renamed over it, so a
//! crash never leaves a half-written file. Reads never fail: a missing or damaged file gives
//! `None`, and the caller falls back to defaults.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::AppError;

/// Path of `file_name` in the app's config folder.
pub fn config_file<R: Runtime>(app: &AppHandle<R>, file_name: &str) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    Ok(dir.join(file_name))
}

/// Reads and parses a JSON file; `None` if it is missing, unreadable or not valid.
pub fn read_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Serializes `value` and writes it atomically, refusing documents larger than `max_bytes`.
pub fn write_json<T: Serialize>(path: &Path, value: &T, max_bytes: usize) -> Result<(), AppError> {
    let text =
        serde_json::to_string_pretty(value).map_err(|e| AppError::InvalidInput(e.to_string()))?;
    if text.len() > max_bytes {
        return Err(AppError::InvalidInput(format!(
            "{} is too large",
            path.file_name().unwrap_or_default().to_string_lossy()
        )));
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
