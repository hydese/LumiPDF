//! Saving files the user asked for (snips now; exported PDFs later).
//!
//! The frontend sends only the bytes and a suggested name; the user picks the destination in the
//! system save dialog. No command writes to a path chosen by the frontend.

use std::fs;

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Runtime};

use crate::AppError;

const MAX_PNG_BYTES: usize = 200 * 1024 * 1024;
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// A safe default file name: no folders, no characters Windows refuses, ends in `.png`.
pub fn suggested_png_name(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if "\\/:*?\"<>|".contains(c) || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    let stem = if trimmed.is_empty() {
        "LumiPDF snip"
    } else {
        trimmed
    };
    let stem: String = stem.chars().take(120).collect();
    if stem.to_ascii_lowercase().ends_with(".png") {
        stem
    } else {
        format!("{stem}.png")
    }
}

/// Saves PNG bytes (the raw request body) where the user chooses. Returns false if cancelled.
/// The suggested name comes in the `x-file-name` header (URL-encoded).
#[tauri::command]
pub async fn save_png<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<bool, AppError> {
    use tauri_plugin_dialog::DialogExt;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::InvalidInput("Expected image bytes".into()));
    };
    if bytes.len() > MAX_PNG_BYTES || !bytes.starts_with(PNG_SIGNATURE) {
        return Err(AppError::InvalidInput("Not a PNG image".into()));
    }
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default();
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(suggested_png_name(&name))
        .add_filter("PNG image", &["png"])
        .blocking_save_file()
        .and_then(|f| f.into_path().ok())
    else {
        return Ok(false);
    };
    let path = if path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("png"))
    {
        path
    } else {
        path.with_extension("png")
    };
    fs::write(&path, bytes)?;
    Ok(true)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suggested_names_are_safe() {
        assert_eq!(
            suggested_png_name("Analisi 2 — p. 148"),
            "Analisi 2 — p. 148.png"
        );
        assert_eq!(suggested_png_name("../../evil"), "-..-evil.png");
        assert_eq!(suggested_png_name("a:b*c?.PNG"), "a-b-c-.PNG");
        assert_eq!(suggested_png_name("   "), "LumiPDF snip.png");
    }

    #[test]
    fn decodes_percent_escapes() {
        assert_eq!(
            percent_decode("Analisi%202%20%E2%80%94%20p.%201"),
            "Analisi 2 — p. 1"
        );
        assert_eq!(percent_decode("100%"), "100%");
    }
}
