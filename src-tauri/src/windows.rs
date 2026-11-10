//! More than one LumiPDF window. Every window is independent: closing one (even the first) leaves
//! the others open, and LumiPDF quits with the last one. Extra windows ("reader-N") are opened
//! from a tab (↗, or right-click → "Move to a new window") or with Ctrl/⌘+Shift+N.
//!
//! One window at a time is the **primary** one (at start, "main"): it remembers the open tabs
//! for the next start, checks for updates and rings the timers. When it closes, the role passes
//! to another open window ("window-primary" event).
//!
//! The timers are shared: the latest timer state (JSON, from the frontend) is kept here and sent
//! to every other window, so each window shows and controls the same timer.
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
    /// The primary window's label (empty = "main", the first window).
    primary: Mutex<String>,
    /// The shared timer state (JSON from the frontend), for windows that open later.
    timers: Mutex<Option<String>>,
}

fn primary_label(state: &Windows) -> String {
    match state.primary.lock() {
        Ok(p) if !p.is_empty() => p.clone(),
        _ => "main".into(),
    }
}

/// The key a PDF is registered under: on Windows and macOS paths ignore letter case, so
/// `C:\Libri\a.pdf` and `c:/libri/A.pdf` are the same document.
fn doc_key(path: &str) -> String {
    if cfg!(any(target_os = "windows", target_os = "macos")) {
        path.replace('\\', "/").to_lowercase()
    } else {
        path.to_string()
    }
}

/// The window the user is working in: the focused one, else the primary one.
pub fn active_label<R: Runtime>(app: &AppHandle<R>) -> String {
    let windows = app.webview_windows();
    if let Some((label, _)) = windows
        .iter()
        .find(|(_, w)| w.is_focused().unwrap_or(false))
    {
        return label.clone();
    }
    let primary = primary_label(&app.state::<Windows>());
    if windows.contains_key(&primary) {
        return primary;
    }
    windows.into_keys().min().unwrap_or_else(|| "main".into())
}

/// A window was closed: forget its documents, and pass the primary role on if it had it.
pub fn forget<R: Runtime>(app: &AppHandle<R>, label: &str) {
    let state = app.state::<Windows>();
    if let Ok(mut docs) = state.docs.lock() {
        docs.retain(|_, l| l != label);
    }
    if let Ok(mut handoff) = state.handoff.lock() {
        handoff.remove(label);
    };
    if primary_label(&state) != label {
        return;
    }
    let windows = app.webview_windows();
    let next = windows
        .iter()
        .filter(|(l, _)| l.as_str() != label)
        .find(|(_, w)| w.is_focused().unwrap_or(false))
        .map(|(l, _)| l.clone())
        .or_else(|| {
            windows
                .keys()
                .filter(|l| l.as_str() != label)
                .min()
                .cloned()
        });
    if let Some(next) = next {
        if let Ok(mut primary) = state.primary.lock() {
            *primary = next.clone();
        }
        let _ = app.emit_to(next.as_str(), "window-primary", ());
    }
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
    let key = doc_key(&path);
    if let Some(owner) = docs.get(&key) {
        if owner != window.label() && app.get_webview_window(owner).is_some() {
            return Some(owner.clone());
        }
    }
    docs.insert(key, window.label().to_string());
    None
}

/// This window closed the PDF.
#[tauri::command]
pub fn window_release_doc<R: Runtime>(window: WebviewWindow<R>, path: String) {
    let state = window.state::<Windows>();
    if let Ok(mut docs) = state.docs.lock() {
        let key = doc_key(&path);
        if docs.get(&key).map(String::as_str) == Some(window.label()) {
            docs.remove(&key);
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

/// Whether this window is the primary one (see the module notes).
#[tauri::command]
pub fn window_is_primary<R: Runtime>(window: WebviewWindow<R>) -> bool {
    primary_label(&window.state::<Windows>()) == window.label()
}

/// How many LumiPDF windows are open (closing the last one quits LumiPDF).
#[tauri::command]
pub fn window_count<R: Runtime>(app: AppHandle<R>) -> usize {
    app.webview_windows().len()
}

/// Whether any LumiPDF window is in front (study time without reading counts only once).
#[tauri::command]
pub fn window_any_focused<R: Runtime>(app: AppHandle<R>) -> bool {
    app.webview_windows()
        .values()
        .any(|w| w.is_focused().unwrap_or(false))
}

/// A window changed the timers: keep the state for later windows and send it to the others.
#[tauri::command]
pub fn timers_publish<R: Runtime>(window: WebviewWindow<R>, state: String) -> Result<(), AppError> {
    if state.len() > 16 * 1024 {
        return Err(AppError::InvalidInput("timers".into()));
    }
    if let Ok(mut timers) = window.state::<Windows>().timers.lock() {
        *timers = Some(state.clone());
    }
    let from = window.label().to_string();
    window
        .app_handle()
        .emit_filter("timers-state", state, |target| match target {
            tauri::EventTarget::WebviewWindow { label } => *label != from,
            _ => false,
        })
        .map_err(|e| AppError::InvalidInput(e.to_string()))
}

/// The current shared timer state, for a window that just opened.
#[tauri::command]
pub fn timers_get<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    app.state::<Windows>().timers.lock().ok()?.clone()
}

#[cfg(test)]
mod tests {
    use super::doc_key;

    #[test]
    fn same_pdf_whatever_the_spelling() {
        if cfg!(any(target_os = "windows", target_os = "macos")) {
            assert_eq!(
                doc_key("C:\\Libri\\Analisi.pdf"),
                doc_key("c:/libri/analisi.PDF")
            );
        } else {
            assert_ne!(
                doc_key("/home/a/Analisi.pdf"),
                doc_key("/home/a/analisi.pdf")
            );
        }
    }
}
