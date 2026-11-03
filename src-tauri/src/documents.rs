//! Opening documents.
//!
//! The webview can only read files that Rust has explicitly granted through the asset
//! protocol scope. Files reach that scope in exactly three ways, all started by the user:
//! the open dialog, drag-and-drop onto the window, and "Open with" (command-line arguments
//! or a second launch). The frontend has no command that grants an arbitrary path.

use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::AppError;

/// Event emitted when the user opens documents while the app is running.
pub const DOCUMENTS_OPENED_EVENT: &str = "documents-opened";

/// A PDF the webview is allowed to read.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DocumentRef {
    pub path: String,
    pub name: String,
    pub size: u64,
}

/// Documents opened before the frontend was ready to receive events (startup arguments).
#[derive(Default)]
pub struct PendingDocuments(Mutex<Vec<DocumentRef>>);

/// The PDF header may start a little after byte 0; readers accept it within the first 1 KB.
const HEADER_SEARCH_BYTES: usize = 1024;

/// Checks that `path` is an existing regular file that is a PDF, by extension or by header.
pub fn validate_pdf_path(path: &Path) -> Result<PathBuf, AppError> {
    let canonical = path
        .canonicalize()
        .map_err(|_| AppError::InvalidInput(format!("File not found: {}", path.display())))?;
    if !canonical.is_file() {
        return Err(AppError::InvalidInput(format!(
            "Not a file: {}",
            path.display()
        )));
    }
    let has_pdf_extension = canonical
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));
    if has_pdf_extension || has_pdf_header(&canonical)? {
        Ok(canonical)
    } else {
        Err(AppError::InvalidInput(format!(
            "Not a PDF file: {}",
            path.display()
        )))
    }
}

fn has_pdf_header(path: &Path) -> Result<bool, AppError> {
    let mut buf = Vec::with_capacity(HEADER_SEARCH_BYTES);
    File::open(path)?
        .take(HEADER_SEARCH_BYTES as u64)
        .read_to_end(&mut buf)?;
    Ok(buf.windows(5).any(|w| w == b"%PDF-"))
}

/// Validates `path`, allows the webview to read it and returns its reference.
pub fn grant<R: Runtime>(app: &AppHandle<R>, path: &Path) -> Result<DocumentRef, AppError> {
    let canonical = validate_pdf_path(path)?;
    app.asset_protocol_scope()
        .allow_file(&canonical)
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    let name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let size = canonical.metadata()?.len();
    Ok(DocumentRef {
        path: display_path(&canonical),
        name,
        size,
    })
}

/// Grants every valid PDF among `paths`, silently skipping anything else.
pub fn grant_all<R: Runtime>(app: &AppHandle<R>, paths: &[PathBuf]) -> Vec<DocumentRef> {
    paths.iter().filter_map(|p| grant(app, p).ok()).collect()
}

/// Sends newly opened documents to the frontend.
pub fn emit_opened<R: Runtime>(app: &AppHandle<R>, docs: Vec<DocumentRef>) {
    if !docs.is_empty() {
        let _ = app.emit(DOCUMENTS_OPENED_EVENT, docs);
    }
}

/// Keeps documents opened at startup until the frontend asks for them.
pub fn queue_pending<R: Runtime>(app: &AppHandle<R>, docs: Vec<DocumentRef>) {
    if let Ok(mut pending) = app.state::<PendingDocuments>().0.lock() {
        pending.extend(docs);
    }
}

/// Extracts file paths from command-line arguments, ignoring flags.
pub fn paths_from_args<I: IntoIterator<Item = String>>(args: I) -> Vec<PathBuf> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(PathBuf::from)
        .collect()
}

/// On Windows `canonicalize` returns `\\?\C:\...`; the asset protocol and users expect `C:\...`.
pub fn display_path(path: &Path) -> String {
    let s = path.to_string_lossy();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

#[tauri::command]
pub async fn open_pdf_dialog<R: Runtime>(app: AppHandle<R>) -> Result<Vec<DocumentRef>, AppError> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .add_filter("PDF documents", &["pdf"])
        .blocking_pick_files()
        .unwrap_or_default();
    let paths: Vec<PathBuf> = picked
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .collect();
    Ok(grant_all(&app, &paths))
}

#[tauri::command]
pub fn take_pending_documents(state: tauri::State<'_, PendingDocuments>) -> Vec<DocumentRef> {
    state
        .0
        .lock()
        .map(|mut p| std::mem::take(&mut *p))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
        let path = dir.join(name);
        File::create(&path).unwrap().write_all(bytes).unwrap();
        path
    }

    #[test]
    fn accepts_pdf_extension_in_any_case() {
        let dir = tempfile::tempdir().unwrap();
        assert!(validate_pdf_path(&write(dir.path(), "a.pdf", b"%PDF-1.7")).is_ok());
        assert!(validate_pdf_path(&write(dir.path(), "b.PDF", b"%PDF-1.7")).is_ok());
    }

    #[test]
    fn accepts_pdf_header_without_extension() {
        let dir = tempfile::tempdir().unwrap();
        let mut bytes = vec![b' '; 300];
        bytes.extend_from_slice(b"%PDF-1.4\n");
        assert!(validate_pdf_path(&write(dir.path(), "scan", &bytes)).is_ok());
    }

    #[test]
    fn rejects_other_files_and_folders() {
        let dir = tempfile::tempdir().unwrap();
        assert!(validate_pdf_path(&write(dir.path(), "notes.txt", b"hello")).is_err());
        assert!(validate_pdf_path(dir.path()).is_err());
        assert!(validate_pdf_path(&dir.path().join("missing.pdf")).is_err());
    }

    #[test]
    fn skips_flags_and_program_name_in_args() {
        let args = ["lumipdf.exe", "--flag", "C:/a.pdf", "b.pdf"].map(String::from);
        assert_eq!(
            paths_from_args(args),
            vec![PathBuf::from("C:/a.pdf"), PathBuf::from("b.pdf")]
        );
    }

    #[test]
    fn strips_windows_extended_prefix() {
        assert_eq!(
            display_path(Path::new(r"\\?\C:\Books\a.pdf")),
            r"C:\Books\a.pdf"
        );
        assert_eq!(display_path(Path::new("/home/u/a.pdf")), "/home/u/a.pdf");
    }
}
