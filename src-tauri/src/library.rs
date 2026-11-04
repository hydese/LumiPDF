//! The library: folders the user added, documents they opened, and their reading state.
//!
//! Rust owns this list. The webview may read a file only if the user picked it (open dialog,
//! drag-and-drop, "Open with") or it sits inside a folder the user added with the folder dialog;
//! no command takes a path from the frontend and grants it on its own.
//!
//! Stored in `library.json` next to the settings. Files are never moved or copied: the library
//! only remembers where they are.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, State};

use crate::cloud::{self, CloudKind};
use crate::documents::{self, DocumentRef};
use crate::store::{config_file, read_json, write_json};
use crate::AppError;

const FILE_NAME: &str = "library.json";
const MAX_BYTES: usize = 4 * 1024 * 1024;
/// Documents remembered for "Continue reading", newest first.
const MAX_DOCUMENTS: usize = 500;
/// Days of per-document study time kept (the stats screen shows up to a year).
const MAX_DOC_DAYS: usize = 400;
/// A folder scan stops after this many PDFs and reports that it was cut short.
const MAX_FILES_PER_FOLDER: usize = 3000;
const MAX_DEPTH: usize = 8;
const MAX_BOOKMARKS: usize = 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FolderKind {
    Folder,
    /// Cloud drive folders, synced by their desktop apps (see cloud.rs).
    Icloud,
    Onedrive,
    Gdrive,
    Dropbox,
    /// A folder GoodNotes backs notebooks up to as PDFs (Auto Backup).
    Goodnotes,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Folder {
    pub path: String,
    pub kind: FolderKind,
}

/// What the library remembers about one document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocState {
    pub path: String,
    pub name: String,
    /// Milliseconds since 1970; 0 if never opened (e.g. only bookmarked from a folder).
    pub last_opened: u64,
    pub page: u32,
    pub pages: u32,
    pub bookmarks: Vec<u32>,
    pub study_seconds: u64,
    /// Study seconds on this document per local day ("YYYY-MM-DD"), for the stats screen.
    /// Only recent days are kept.
    pub study_days: BTreeMap<String, u64>,
}

impl Default for DocState {
    fn default() -> Self {
        Self {
            path: String::new(),
            name: String::new(),
            last_opened: 0,
            page: 1,
            pages: 0,
            bookmarks: Vec::new(),
            study_seconds: 0,
            study_days: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LibraryData {
    pub folders: Vec<Folder>,
    pub documents: Vec<DocState>,
    /// Study seconds per local day ("YYYY-MM-DD"), from reading and focus sessions.
    pub study_days: BTreeMap<String, u64>,
}

pub struct Library(Mutex<LibraryData>);

/// A PDF found in a library folder.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    /// Milliseconds since 1970.
    pub modified: u64,
    /// Stored only in the cloud (iCloud/OneDrive placeholder); reading it would download it.
    pub cloud_only: bool,
    /// Subfolder inside the library folder, "/"-separated ("" for files at its top level).
    pub dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderView {
    pub path: String,
    pub name: String,
    pub kind: FolderKind,
    pub available: bool,
    pub files: Vec<FileEntry>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocView {
    #[serde(flatten)]
    pub state: DocState,
    /// The file is still there; `None` fields below mean it was moved or deleted.
    pub file: Option<FileEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryView {
    pub folders: Vec<FolderView>,
    pub documents: Vec<DocView>,
    pub study_days: BTreeMap<String, u64>,
    /// Cloud drive folders found on this computer that aren't in the library yet.
    pub cloud_suggestions: Vec<CloudSuggestion>,
}

#[derive(Debug, Serialize)]
pub struct CloudSuggestion {
    pub kind: CloudKind,
    pub path: String,
}

/// Changes the frontend reports while a document is open.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocUpdate {
    /// The document was just opened: move it to the top of "Continue reading".
    pub opened: bool,
    pub page: Option<u32>,
    pub pages: Option<u32>,
    pub bookmarks: Option<Vec<u32>>,
    /// Seconds studied since the last update, counted for `day` ("YYYY-MM-DD", local).
    pub study_seconds: Option<u64>,
    pub day: Option<String>,
}

// -------------------------------------------------------------------------------------------
// Pure logic (tested below)
// -------------------------------------------------------------------------------------------

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn ms(time: std::io::Result<SystemTime>) -> u64 {
    time.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

#[cfg(windows)]
fn is_cloud_only(meta: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const OFFLINE: u32 = 0x1000;
    const RECALL_ON_OPEN: u32 = 0x0004_0000;
    const RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;
    meta.file_attributes() & (OFFLINE | RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS) != 0
}

#[cfg(not(windows))]
fn is_cloud_only(_meta: &fs::Metadata) -> bool {
    false
}

fn entry_for(path: &Path, meta: &fs::Metadata) -> FileEntry {
    FileEntry {
        path: path.to_string_lossy().into_owned(),
        name: file_name(path),
        size: meta.len(),
        modified: ms(meta.modified()),
        cloud_only: is_cloud_only(meta),
        dir: String::new(),
    }
}

fn is_pdf_name(path: &Path) -> bool {
    path.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
}

/// The folder of `file` relative to `root`, as "a/b" ("" when directly in `root`).
fn relative_dir(root: &Path, file: &Path) -> String {
    file.parent()
        .and_then(|p| p.strip_prefix(root).ok())
        .map(|rel| {
            rel.components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/")
        })
        .unwrap_or_default()
}

/// Finds PDFs under `root` (hidden files and folders skipped), newest first.
pub fn scan_folder(root: &Path) -> (Vec<FileEntry>, bool) {
    let mut found = Vec::new();
    let mut truncated = false;
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name.to_string_lossy().starts_with('.') {
                continue;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if file_type.is_dir() {
                if depth < MAX_DEPTH {
                    stack.push((path, depth + 1));
                }
            } else if file_type.is_file() && is_pdf_name(&path) {
                if found.len() >= MAX_FILES_PER_FOLDER {
                    truncated = true;
                    break;
                }
                if let Ok(meta) = entry.metadata() {
                    let mut file = entry_for(&path, &meta);
                    file.dir = relative_dir(root, &path);
                    found.push(file);
                }
            }
        }
    }
    found.sort_by(|a, b| b.modified.cmp(&a.modified).then(a.name.cmp(&b.name)));
    (found, truncated)
}

/// Normalizes a path the way documents are stored (canonical, without `\\?\` on Windows).
fn normalize(path: &Path) -> Option<PathBuf> {
    path.canonicalize()
        .ok()
        .map(|p| PathBuf::from(documents::display_path(&p)))
}

impl LibraryData {
    /// True if the user already gave access to `path`: it is a remembered document or lies in an
    /// added folder.
    pub fn knows(&self, path: &Path) -> bool {
        self.documents.iter().any(|d| Path::new(&d.path) == path)
            || self
                .folders
                .iter()
                .any(|f| path.starts_with(Path::new(&f.path)))
    }

    pub fn add_folder(&mut self, path: String, kind: FolderKind) -> bool {
        if self.folders.iter().any(|f| f.path == path) {
            return false;
        }
        self.folders.push(Folder { path, kind });
        true
    }

    pub fn remove_folder(&mut self, path: &str) {
        self.folders.retain(|f| f.path != path);
    }

    pub fn forget(&mut self, path: &str) {
        self.documents.retain(|d| d.path != path);
    }

    /// Applies `update` to the document at `path`, creating its entry if needed.
    pub fn update_document(&mut self, path: &str, name: String, update: DocUpdate, now: u64) {
        let index = match self.documents.iter().position(|d| d.path == path) {
            Some(i) => i,
            None => {
                self.documents.push(DocState {
                    path: path.to_string(),
                    name,
                    ..Default::default()
                });
                self.documents.len() - 1
            }
        };
        let doc = &mut self.documents[index];
        if update.opened {
            doc.last_opened = now;
        }
        if let Some(pages) = update.pages {
            doc.pages = pages;
        }
        if let Some(page) = update.page {
            doc.page = page.max(1);
        }
        if doc.pages > 0 {
            doc.page = doc.page.min(doc.pages);
        }
        if let Some(mut bookmarks) = update.bookmarks {
            bookmarks.retain(|&p| p >= 1 && (doc.pages == 0 || p <= doc.pages));
            bookmarks.sort_unstable();
            bookmarks.dedup();
            bookmarks.truncate(MAX_BOOKMARKS);
            doc.bookmarks = bookmarks;
        }
        if let Some(seconds) = update.study_seconds {
            // A single update never covers more than an hour; anything larger is a bad clock.
            let seconds = seconds.min(3600);
            doc.study_seconds += seconds;
            if let Some(day) = update.day.filter(|d| is_day(d)) {
                *self.study_days.entry(day.clone()).or_default() += seconds;
                *doc.study_days.entry(day).or_default() += seconds;
                while doc.study_days.len() > MAX_DOC_DAYS {
                    doc.study_days.pop_first();
                }
            }
        }
        self.documents
            .sort_by_key(|d| std::cmp::Reverse(d.last_opened));
        self.documents.truncate(MAX_DOCUMENTS);
    }
}

fn is_day(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

// -------------------------------------------------------------------------------------------
// Tauri glue
// -------------------------------------------------------------------------------------------

fn library_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
    config_file(app, FILE_NAME)
}

/// Loads the library at startup and lets the webview read everything in it.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    let data: LibraryData = library_path(app)
        .ok()
        .and_then(|p| read_json(&p))
        .unwrap_or_default();
    for folder in &data.folders {
        allow_folder(app, Path::new(&folder.path));
    }
    for doc in &data.documents {
        let _ = app.asset_protocol_scope().allow_file(&doc.path);
    }
    app.manage(Library(Mutex::new(data)));
}

fn allow_folder<R: Runtime>(app: &AppHandle<R>, path: &Path) {
    // Only PDFs are listed and opened, but the scope covers the folder so that thousands of
    // files don't each need an entry.
    let _ = app.asset_protocol_scope().allow_directory(path, true);
}

fn save<R: Runtime>(app: &AppHandle<R>, data: &LibraryData) -> Result<(), AppError> {
    write_json(&library_path(app)?, data, MAX_BYTES)
}

fn lock<'a>(
    library: &'a State<'_, Library>,
) -> Result<std::sync::MutexGuard<'a, LibraryData>, AppError> {
    library
        .0
        .lock()
        .map_err(|_| AppError::InvalidInput("Library is unavailable".into()))
}

fn cloud_kind(kind: FolderKind) -> Option<CloudKind> {
    match kind {
        FolderKind::Icloud => Some(CloudKind::Icloud),
        FolderKind::Onedrive => Some(CloudKind::Onedrive),
        FolderKind::Gdrive => Some(CloudKind::Gdrive),
        FolderKind::Dropbox => Some(CloudKind::Dropbox),
        FolderKind::Folder | FolderKind::Goodnotes => None,
    }
}

fn folder_kind(kind: CloudKind) -> FolderKind {
    match kind {
        CloudKind::Icloud => FolderKind::Icloud,
        CloudKind::Onedrive => FolderKind::Onedrive,
        CloudKind::Gdrive => FolderKind::Gdrive,
        CloudKind::Dropbox => FolderKind::Dropbox,
    }
}

fn detect_cloud<R: Runtime>(app: &AppHandle<R>, kind: CloudKind) -> Option<PathBuf> {
    let home = app.path().home_dir().ok()?;
    cloud::detect(kind, &home, &|k| std::env::var(k).ok())
}

fn build_view<R: Runtime>(app: &AppHandle<R>, data: &LibraryData) -> LibraryView {
    let folders = data
        .folders
        .iter()
        .map(|f| {
            let path = Path::new(&f.path);
            let available = path.is_dir();
            let (files, truncated) = if available {
                scan_folder(path)
            } else {
                (Vec::new(), false)
            };
            FolderView {
                path: f.path.clone(),
                name: file_name(path),
                kind: f.kind,
                available,
                files,
                truncated,
            }
        })
        .collect();
    let documents = data
        .documents
        .iter()
        .map(|d| {
            let path = Path::new(&d.path);
            DocView {
                state: d.clone(),
                file: fs::metadata(path)
                    .ok()
                    .filter(|m| m.is_file())
                    .map(|m| entry_for(path, &m)),
            }
        })
        .collect();
    let cloud_suggestions = cloud::ALL
        .into_iter()
        .filter(|k| !data.folders.iter().any(|f| f.kind == folder_kind(*k)))
        .filter_map(|kind| {
            let path = detect_cloud(app, kind).and_then(|p| normalize(&p))?;
            let path = path.to_string_lossy().into_owned();
            (!data.folders.iter().any(|f| f.path == path)).then_some(CloudSuggestion { kind, path })
        })
        .collect();
    LibraryView {
        folders,
        documents,
        study_days: data.study_days.clone(),
        cloud_suggestions,
    }
}

/// Everything the Library screen shows. Scans the folders, so it runs off the main thread.
#[tauri::command]
pub async fn library_load<R: Runtime>(app: AppHandle<R>) -> Result<LibraryView, AppError> {
    let data = lock(&app.state::<Library>())?.clone();
    tauri::async_runtime::spawn_blocking(move || build_view(&app, &data))
        .await
        .map_err(|e| AppError::InvalidInput(e.to_string()))
}

/// Adds a folder the user picks. For a cloud drive, its usual folder is used when it exists.
/// Returns false if the user cancelled.
#[tauri::command]
pub async fn library_add_folder<R: Runtime>(
    app: AppHandle<R>,
    kind: FolderKind,
) -> Result<bool, AppError> {
    use tauri_plugin_dialog::DialogExt;
    let pick = || {
        app.dialog()
            .file()
            .blocking_pick_folder()
            .and_then(|f| f.into_path().ok())
    };
    // Cloud drives are found automatically; if one lives somewhere unusual, the user picks it.
    let picked = match cloud_kind(kind) {
        Some(cloud) => detect_cloud(&app, cloud).or_else(pick),
        None => pick(),
    };
    let Some(path) = picked.and_then(|p| normalize(&p)).filter(|p| p.is_dir()) else {
        return Ok(false);
    };
    allow_folder(&app, &path);
    let library = app.state::<Library>();
    let mut data = lock(&library)?;
    if data.add_folder(path.to_string_lossy().into_owned(), kind) {
        save(&app, &data)?;
    }
    Ok(true)
}

/// Removes a folder from the library (the folder itself is not touched).
#[tauri::command]
pub fn library_remove_folder<R: Runtime>(
    app: AppHandle<R>,
    library: State<'_, Library>,
    path: String,
) -> Result<(), AppError> {
    let mut data = lock(&library)?;
    data.remove_folder(&path);
    save(&app, &data)
}

/// Opens a document that is already in the library.
#[tauri::command]
pub fn library_open<R: Runtime>(
    app: AppHandle<R>,
    library: State<'_, Library>,
    path: String,
) -> Result<DocumentRef, AppError> {
    let normalized = normalize(Path::new(&path))
        .ok_or_else(|| AppError::InvalidInput(format!("File not found: {path}")))?;
    if !lock(&library)?.knows(&normalized) {
        return Err(AppError::InvalidInput(
            "This file is not in your library".into(),
        ));
    }
    documents::grant(&app, &normalized)
}

/// Records reading progress, bookmarks and study time for an open document.
#[tauri::command]
pub fn library_update<R: Runtime>(
    app: AppHandle<R>,
    library: State<'_, Library>,
    path: String,
    update: DocUpdate,
) -> Result<(), AppError> {
    // Only documents the user actually opened (and so were granted) can be recorded.
    let normalized = normalize(Path::new(&path))
        .ok_or_else(|| AppError::InvalidInput(format!("File not found: {path}")))?;
    if !app.asset_protocol_scope().is_allowed(&normalized) {
        return Err(AppError::InvalidInput("This document is not open".into()));
    }
    let key = normalized.to_string_lossy().into_owned();
    let mut data = lock(&library)?;
    data.update_document(&key, file_name(&normalized), update, now_ms());
    save(&app, &data)
}

/// Adds focus-timer time to today's study total (not tied to a document).
#[tauri::command]
pub fn library_add_study_time<R: Runtime>(
    app: AppHandle<R>,
    library: State<'_, Library>,
    day: String,
    seconds: u64,
) -> Result<(), AppError> {
    if !is_day(&day) {
        return Err(AppError::InvalidInput("Invalid day".into()));
    }
    let mut data = lock(&library)?;
    *data.study_days.entry(day).or_default() += seconds.min(3600);
    save(&app, &data)
}

/// Removes a document from "Continue reading" (the file is not touched).
#[tauri::command]
pub fn library_forget<R: Runtime>(
    app: AppHandle<R>,
    library: State<'_, Library>,
    path: String,
) -> Result<(), AppError> {
    let mut data = lock(&library)?;
    data.forget(&path);
    save(&app, &data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        File::create(path).unwrap();
    }

    #[test]
    fn scans_pdfs_recursively_and_skips_hidden() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("a.pdf"));
        touch(&dir.path().join("sub/b.PDF"));
        touch(&dir.path().join("sub/notes.txt"));
        touch(&dir.path().join(".hidden/c.pdf"));
        touch(&dir.path().join(".d.pdf"));
        let (files, truncated) = scan_folder(dir.path());
        let mut names: Vec<_> = files
            .iter()
            .map(|f| (f.dir.as_str(), f.name.as_str()))
            .collect();
        names.sort();
        assert_eq!(names, [("", "a.pdf"), ("sub", "b.PDF")]);
        assert!(!truncated);
    }

    #[test]
    fn knows_documents_and_files_inside_folders_only() {
        let mut data = LibraryData::default();
        data.add_folder("/books".into(), FolderKind::Folder);
        data.update_document("/elsewhere/x.pdf", "x.pdf".into(), DocUpdate::default(), 1);
        assert!(data.knows(Path::new("/books/sub/a.pdf")));
        assert!(data.knows(Path::new("/elsewhere/x.pdf")));
        assert!(!data.knows(Path::new("/elsewhere/y.pdf")));
        assert!(!data.knows(Path::new("/bookshelf/a.pdf")));
        assert!(!data.add_folder("/books".into(), FolderKind::Folder));
    }

    #[test]
    fn updates_progress_bookmarks_and_study_time() {
        let mut data = LibraryData::default();
        let open = |page| DocUpdate {
            opened: true,
            pages: Some(10),
            page: Some(page),
            ..Default::default()
        };
        data.update_document("/a.pdf", "a.pdf".into(), open(3), 100);
        data.update_document("/b.pdf", "b.pdf".into(), open(99), 200);
        assert_eq!(data.documents[0].path, "/b.pdf");
        assert_eq!(data.documents[0].page, 10);

        data.update_document(
            "/a.pdf",
            String::new(),
            DocUpdate {
                bookmarks: Some(vec![5, 2, 5, 0, 11]),
                study_seconds: Some(90),
                day: Some("2026-11-04".into()),
                ..Default::default()
            },
            300,
        );
        let a = data.documents.iter().find(|d| d.path == "/a.pdf").unwrap();
        assert_eq!(a.bookmarks, vec![2, 5]);
        assert_eq!(a.study_seconds, 90);
        assert_eq!(data.study_days["2026-11-04"], 90);
        assert_eq!(a.study_days["2026-11-04"], 90);
        assert_eq!(a.name, "a.pdf");
    }

    #[test]
    fn rejects_bad_days() {
        assert!(is_day("2026-11-04"));
        assert!(!is_day("2026-1-04"));
        assert!(!is_day("../../x"));
    }

    #[test]
    fn old_or_partial_files_load_with_defaults() {
        let data: LibraryData =
            serde_json::from_str(r#"{"documents":[{"path":"/a.pdf"}],"unknown":1}"#).unwrap();
        assert_eq!(data.documents[0].page, 1);
        assert!(data.folders.is_empty());
    }
}
