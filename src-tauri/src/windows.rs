//! More than one LumiPDF window. The main window ("main") keeps the session, the updater and
//! the timers; extra windows ("reader-N") are readers opened from a tab (↗, or right-click →
//! "Move to a new window") or with Ctrl/⌘+Shift+N.
//!
//! The registry knows which window has which PDF open, so opening a PDF that another window
//! already shows brings that window forward instead of opening it twice (two windows editing
//! the same annotations would overwrite each other).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

use crate::AppError;

#[derive(Default)]
pub struct Windows {
    /// Open PDF path → label of the window showing it.
    docs: Mutex<HashMap<String, String>>,
    /// What a new window should open first (a moved tab), by window label.
    handoff: Mutex<HashMap<String, String>>,
    next: AtomicU32,
}

/// The window the user is working in: the focused one, else the main window.
pub fn active_label<R: Runtime>(app: &AppHandle<R>) -> String {
    app.webview_windows()
        .into_iter()
        .find(|(_, w)| w.is_focused().unwrap_or(false))
        .map(|(label, _)| label)
        .unwrap_or_else(|| "main".into())
}

/// A window was closed: forget its documents.
pub fn forget<R: Runtime>(app: &AppHandle<R>, label: &str) {
    let state = app.state::<Windows>();
    if let Ok(mut docs) = state.docs.lock() {
        docs.retain(|_, l| l != label);
    }
    if let Ok(mut handoff) = state.handoff.lock() {
        handoff.remove(label);
    };
}

/// Opens a new reader window, optionally with a tab to show (JSON from the frontend).
/// Async: building a window from a synchronous command can deadlock on Windows.
#[tauri::command]
pub async fn window_open<R: Runtime>(
    app: AppHandle<R>,
    tab: Option<String>,
) -> Result<String, AppError> {
    let state = app.state::<Windows>();
    let label = format!("reader-{}", state.next.fetch_add(1, Ordering::Relaxed) + 1);
    if let Some(tab) = tab {
        if tab.len() > 64 * 1024 {
            return Err(AppError::InvalidInput("tab".into()));
        }
        if let Ok(mut handoff) = state.handoff.lock() {
            handoff.insert(label.clone(), tab);
        }
    }
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .ok_or_else(|| AppError::InvalidInput("no window configuration".into()))?;
    config.label = label.clone();
    config.title = "LumiPDF".into();
    // Cascade from the window the tab came from.
    if let Some(from) = app.get_webview_window(&active_label(&app)) {
        if let (Ok(pos), Ok(scale)) = (from.outer_position(), from.scale_factor()) {
            config.x = Some(pos.x as f64 / scale + 32.0);
            config.y = Some(pos.y as f64 / scale + 32.0);
        }
    }
    WebviewWindowBuilder::from_config(&app, &config)
        .map_err(|e| AppError::InvalidInput(e.to_string()))?
        .build()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    Ok(label)
}

/// The tab a new window was opened for (once).
#[tauri::command]
pub fn window_take_tab<R: Runtime>(window: WebviewWindow<R>) -> Option<String> {
    let state = window.state::<Windows>();
    let mut handoff = state.handoff.lock().ok()?;
    handoff.remove(window.label())
}

/// Claims a PDF for this window. If another open window already shows it, returns that
/// window's label (nothing is claimed) so the caller can switch to it instead.
#[tauri::command]
pub fn window_claim_doc<R: Runtime>(window: WebviewWindow<R>, path: String) -> Option<String> {
    let app = window.app_handle();
    let state = app.state::<Windows>();
    let mut docs = state.docs.lock().ok()?;
    if let Some(owner) = docs.get(&path) {
        if owner != window.label() && app.get_webview_window(owner).is_some() {
            return Some(owner.clone());
        }
    }
    docs.insert(path, window.label().to_string());
    None
}

/// This window closed the PDF.
#[tauri::command]
pub fn window_release_doc<R: Runtime>(window: WebviewWindow<R>, path: String) {
    let state = window.state::<Windows>();
    if let Ok(mut docs) = state.docs.lock() {
        if docs.get(&path).map(String::as_str) == Some(window.label()) {
            docs.remove(&path);
        }
    };
}

#[derive(Serialize)]
pub struct WindowInfo {
    label: String,
    title: String,
}

/// The other LumiPDF windows (for "Move to window…").
#[tauri::command]
pub fn window_list<R: Runtime>(window: WebviewWindow<R>) -> Vec<WindowInfo> {
    let mut list: Vec<WindowInfo> = window
        .app_handle()
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| label != window.label())
        .map(|(label, w)| WindowInfo {
            title: w.title().unwrap_or_else(|_| "LumiPDF".into()),
            label,
        })
        .collect();
    list.sort_by(|a, b| a.label.cmp(&b.label));
    list
}

/// Sends a tab (JSON) to another window, or asks it to show a PDF it has, and brings it forward.
#[tauri::command]
pub fn window_send<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    event: String,
    payload: String,
) -> Result<(), AppError> {
    if event != "window-tab" && event != "window-show-doc" {
        return Err(AppError::InvalidInput("event".into()));
    }
    let target = app
        .get_webview_window(&label)
        .ok_or_else(|| AppError::InvalidInput("window".into()))?;
    let _ = target.unminimize();
    let _ = target.set_focus();
    target
        .emit_to(label.as_str(), event.as_str(), payload)
        .map_err(|e| AppError::InvalidInput(e.to_string()))
}
