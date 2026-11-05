//! Saving files the user asked for (snips now; exported PDFs later).
//!
//! The frontend sends only the bytes and a suggested name; the user picks the destination in the
//! system save dialog. No command writes to a path chosen by the frontend.

use std::fs;

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, Runtime};

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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    /// The open document (must be one the user opened).
    pub source: String,
    /// Used for the suggested file name.
    pub title: String,
    pub annotations: Vec<crate::pdf_export::ExportAnnotation>,
    pub compression: crate::pdf_export::Compression,
    #[serde(default)]
    pub protection: crate::pdf_export::ProtectionRequest,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDone {
    #[serde(flatten)]
    pub result: crate::pdf_export::ExportResult,
    /// The exported file, ready to open in LumiPDF.
    pub document: Option<crate::documents::DocumentRef>,
}

/// Exports a copy of an open PDF (annotations, compression) where the user chooses.
/// Returns null if the save dialog was cancelled.
#[tauri::command]
pub async fn export_pdf<R: Runtime>(
    app: AppHandle<R>,
    request: ExportRequest,
) -> Result<Option<ExportDone>, AppError> {
    use crate::pdf_export::{export, suggested_pdf_name, with_pdf_extension, Compression};
    use tauri_plugin_dialog::DialogExt;

    let source = std::path::PathBuf::from(&request.source);
    if !app.asset_protocol_scope().is_allowed(&source) {
        return Err(AppError::InvalidInput("This document is not open".into()));
    }
    // Passwords and permissions are checked before asking where to save.
    {
        let (source, protection, annotated) = (
            source.clone(),
            request.protection.clone(),
            !request.annotations.is_empty(),
        );
        tauri::async_runtime::spawn_blocking(move || {
            crate::pdf_export::prepare(&source, &protection, annotated).map(|_| ())
        })
        .await
        .map_err(|e| AppError::InvalidInput(e.to_string()))??;
    }
    let name = suggested_pdf_name(
        &request.title,
        !request.annotations.is_empty(),
        request.compression != Compression::None,
    );
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(name)
        .add_filter("PDF", &["pdf"]);
    if let Some(dir) = source.parent() {
        dialog = dialog.set_directory(dir);
    }
    let Some(dest) = dialog.blocking_save_file().and_then(|f| f.into_path().ok()) else {
        return Ok(None);
    };
    let dest = with_pdf_extension(dest);
    let written = dest.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        export(
            &source,
            &dest,
            &request.annotations,
            request.compression,
            &request.protection,
        )
    })
    .await
    .map_err(|e| AppError::InvalidInput(e.to_string()))??;
    // The new file can be opened right away from the result.
    let document = crate::documents::grant(&app, &written).ok();
    Ok(Some(ExportDone { result, document }))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            // Byte slices, so a multi-byte character after "%" can't split a char boundary.
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(b) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
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
        assert_eq!(percent_decode("%€x"), "%€x");
    }
}

/// How small the copy would get at each compression level, for the Export window.
#[tauri::command]
pub async fn pdf_size_estimate<R: Runtime>(
    app: AppHandle<R>,
    source: String,
    open_password: Option<String>,
) -> Result<crate::pdf_export::SizeEstimate, AppError> {
    let source = std::path::PathBuf::from(source);
    if !app.asset_protocol_scope().is_allowed(&source) {
        return Err(AppError::InvalidInput("This document is not open".into()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        crate::pdf_export::estimate_sizes(&source, open_password.as_deref())
    })
    .await
    .map_err(|e| AppError::InvalidInput(e.to_string()))?
}

/// What protects an open PDF (passwords, restrictions), for the Export window.
#[tauri::command]
pub async fn pdf_protection<R: Runtime>(
    app: AppHandle<R>,
    source: String,
    open_password: Option<String>,
) -> Result<crate::pdf_export::ProtectionInfo, AppError> {
    let source = std::path::PathBuf::from(source);
    if !app.asset_protocol_scope().is_allowed(&source) {
        return Err(AppError::InvalidInput("This document is not open".into()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        crate::pdf_export::protection(&source, open_password.as_deref())
    })
    .await
    .map_err(|e| AppError::InvalidInput(e.to_string()))?
}

/// Printing: a temporary copy of the open document with its annotations, returned as bytes for
/// the app to draw page by page. Refused when the PDF's own permissions don't allow printing
/// (LumiPDF never lifts a restriction it wasn't given the owner password for).
#[tauri::command]
pub async fn print_prepare<R: Runtime>(
    app: AppHandle<R>,
    source: String,
    annotations: Vec<crate::pdf_export::ExportAnnotation>,
    open_password: Option<String>,
) -> Result<tauri::ipc::Response, AppError> {
    use crate::pdf_export::{export, protection, Compression, ProtectionRequest};
    let source = std::path::PathBuf::from(source);
    if !app.asset_protocol_scope().is_allowed(&source) {
        return Err(AppError::InvalidInput("This document is not open".into()));
    }
    let temp = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?
        .join(format!("print-{}.pdf", std::process::id()));
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let info = protection(&source, open_password.as_deref())?;
        if info.restrictions.print {
            return Err(AppError::InvalidInput(
                "This PDF doesn't allow printing".into(),
            ));
        }
        if let Some(dir) = temp.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let request = ProtectionRequest {
            open_password,
            ..Default::default()
        };
        let result = export(&source, &temp, &annotations, Compression::None, &request)
            .and_then(|_| Ok(std::fs::read(&temp)?));
        let _ = std::fs::remove_file(&temp);
        result
    })
    .await
    .map_err(|e| AppError::InvalidInput(e.to_string()))??;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Opens the system print dialog for what the page shows in print (macOS: WebKit's own
/// window.print() does nothing in an app, so the native print operation is used).
#[tauri::command]
pub fn print_window<R: Runtime>(window: tauri::WebviewWindow<R>) -> Result<(), AppError> {
    window
        .print()
        .map_err(|e| AppError::InvalidInput(e.to_string()))
}
