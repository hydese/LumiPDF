//! Beta builds: the performance panel's log, appended to `LumiPDF-performance.log` on the
//! Desktop so testers can send it. The frontend only shows the switch in beta versions.

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
    let dir = app.path().desktop_dir().map_err(|e| AppError::InvalidInput(e.to_string()))?;
    let path = dir.join(FILE_NAME);
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if size < MAX_BYTES {
        let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
        file.write_all(text.as_bytes())?;
    }
    Ok(path.to_string_lossy().into_owned())
}
