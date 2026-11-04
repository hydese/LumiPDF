//! Installing updates in place (installed copies only; the portable exe keeps its "Download"
//! link, because an installer would put a second copy in Program Files).
//!
//! Releases are signed with the project's updater key; the app only installs a download whose
//! signature matches the public key in tauri.conf.json.
//!
//! The frontend decides when (Settings → Updates: automatic, or ask first):
//!   update_check → update_download → update_install
//! Automatic mode downloads in the background and installs when LumiPDF closes (or when you
//! click "Restart to update"); ask-first does the same steps when you click.
//!
//! Channels: two small files on the rolling "updates" release, kept current by the release
//! workflow when a release is published.

use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Runtime, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::AppError;

const STABLE: &str = "https://github.com/hydese/LumiPDF/releases/download/updates/stable.json";
const BETA: &str = "https://github.com/hydese/LumiPDF/releases/download/updates/beta.json";

#[derive(Default)]
pub struct PendingUpdate(Mutex<Pending>);

#[derive(Default)]
pub struct Pending {
    update: Option<Update>,
    /// The downloaded installer, signature already checked.
    bytes: Option<Vec<u8>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMeta {
    pub version: String,
    pub notes: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum DownloadEvent {
    Progress { downloaded: u64, total: Option<u64> },
    Done,
}

fn lock<'a>(
    state: &'a State<'_, PendingUpdate>,
) -> Result<std::sync::MutexGuard<'a, Pending>, AppError> {
    state
        .0
        .lock()
        .map_err(|_| AppError::InvalidInput("Update state unavailable".into()))
}

/// True when this copy was installed (it can update itself); false for the portable exe.
pub fn installed() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    if cfg!(target_os = "macos") {
        return exe.to_string_lossy().contains(".app/Contents/MacOS");
    }
    if cfg!(target_os = "windows") {
        // The NSIS installer puts its uninstaller next to the program.
        return exe
            .parent()
            .is_some_and(|dir| dir.join("uninstall.exe").exists());
    }
    false
}

#[tauri::command]
pub fn update_installable() -> bool {
    installed()
}

/// Looks for a signed update on the chosen channel. Null when there is none (or this copy can't
/// install updates).
#[tauri::command]
pub async fn update_check<R: Runtime>(
    app: AppHandle<R>,
    pending: State<'_, PendingUpdate>,
    beta: bool,
) -> Result<Option<UpdateMeta>, AppError> {
    if !installed() {
        return Ok(None);
    }
    let url = Url::parse(if beta { BETA } else { STABLE })
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    let update = app
        .updater_builder()
        .endpoints(vec![url])
        .and_then(|b| b.build())
        .map_err(|e| AppError::InvalidInput(e.to_string()))?
        .check()
        .await
        .map_err(|e| AppError::InvalidInput(format!("Couldn't check for updates: {e}")))?;
    let meta = update.as_ref().map(|u| UpdateMeta {
        version: u.version.clone(),
        notes: u.body.clone(),
    });
    let mut state = lock(&pending)?;
    let same = matches!((&state.update, &update), (Some(a), Some(b)) if a.version == b.version);
    if !same {
        state.bytes = None;
    }
    state.update = update;
    Ok(meta)
}

/// Downloads the update found by `update_check` and checks its signature. Installing is a
/// separate step, so automatic mode can wait until LumiPDF closes.
#[tauri::command]
pub async fn update_download(
    pending: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), AppError> {
    let update = {
        let state = lock(&pending)?;
        if state.bytes.is_some() {
            let _ = on_event.send(DownloadEvent::Done);
            return Ok(());
        }
        state
            .update
            .clone()
            .ok_or_else(|| AppError::InvalidInput("No update to download. Check again.".into()))?
    };
    let mut downloaded = 0u64;
    let progress = on_event.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress.send(DownloadEvent::Progress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| AppError::InvalidInput(format!("The update couldn't be downloaded: {e}")))?;
    lock(&pending)?.bytes = Some(bytes);
    let _ = on_event.send(DownloadEvent::Done);
    Ok(())
}

/// Installs the downloaded update. On Windows the installer takes over and LumiPDF closes; on
/// macOS LumiPDF restarts. The frontend saves everything first.
#[tauri::command]
pub fn update_install<R: Runtime>(
    app: AppHandle<R>,
    pending: State<'_, PendingUpdate>,
) -> Result<(), AppError> {
    let (update, bytes) = {
        let mut state = lock(&pending)?;
        let bytes = state
            .bytes
            .take()
            .ok_or_else(|| AppError::InvalidInput("The update isn't downloaded yet".into()))?;
        let update = state
            .update
            .take()
            .ok_or_else(|| AppError::InvalidInput("No update to install".into()))?;
        (update, bytes)
    };
    update
        .install(bytes)
        .map_err(|e| AppError::InvalidInput(format!("The update couldn't be installed: {e}")))?;
    app.restart();
}
