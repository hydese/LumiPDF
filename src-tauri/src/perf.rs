//! BETA BUILDS ONLY: the performance panel's log, appended to `LumiPDF-performance.log` on the
//! Desktop so testers can send it, and the photo-training examples (a folder per example in
//! `LumiPDF-esempi` on the Desktop). The frontend only offers these in beta versions.

use std::fs::OpenOptions;
use std::io::Write;
use tauri::{AppHandle, Manager, Runtime};

use crate::AppError;

/// The log stops growing past this size (it's for a test session, not a diary).
const MAX_BYTES: u64 = 5 * 1024 * 1024;
const FILE_NAME: &str = "LumiPDF-performance.log";

/// Appends `text` to the log on the Desktop; returns the log's path.
#[tauri::command]
pub fn perf_log<R: Runtime>(app: AppHandle<R>, text: String) -> Result<String, AppError> {
    let dir = app
        .path()
        .desktop_dir()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    let path = dir.join(FILE_NAME);
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if size < MAX_BYTES {
        let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
        file.write_all(text.as_bytes())?;
    }
    Ok(path.to_string_lossy().into_owned())
}

const EXAMPLES_DIR: &str = "LumiPDF-esempi";

/// Saves one photo-training example: `original.png`, `dark.png` (as dark mode drew it before
/// the correction) and `info.json`, in a new folder under `LumiPDF-esempi` on the Desktop.
/// Returns the folder's path.
#[tauri::command]
pub fn save_photo_example<R: Runtime>(
    app: AppHandle<R>,
    photo: bool,
    original: Vec<u8>,
    dark: Vec<u8>,
    info: String,
) -> Result<String, AppError> {
    let base = app
        .path()
        .desktop_dir()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?
        .join(EXAMPLES_DIR);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let label = if photo { "foto" } else { "non-foto" };
    let dir = base.join(format!("esempio-{stamp}-{label}"));
    std::fs::create_dir_all(&dir)?;
    if !original.is_empty() {
        std::fs::write(dir.join("original.png"), &original)?;
    }
    if !dark.is_empty() {
        std::fs::write(dir.join("dark.png"), &dark)?;
    }
    std::fs::write(dir.join("info.json"), info.as_bytes())?;
    Ok(dir.to_string_lossy().into_owned())
}
