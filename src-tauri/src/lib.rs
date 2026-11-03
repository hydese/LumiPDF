//! LumiPDF desktop backend.
//!
//! The frontend renders PDFs with pdf.js; this crate owns everything that touches the disk:
//! which files the webview may read, user settings, and later the library index, annotation sidecars,
//! study stats, export and compression. Each area lives in its own module.

mod commands;
mod documents;
mod error;
mod settings;

pub use error::AppError;

use tauri::{DragDropEvent, Manager, WindowEvent};

pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch ("Open with" while running) forwards
        // its arguments here instead of opening another window.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let docs = documents::grant_all(app, &documents::paths_from_args(args));
            documents::emit_opened(app, docs);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(documents::PendingDocuments::default())
        .setup(|app| {
            let paths = documents::paths_from_args(std::env::args());
            let docs = documents::grant_all(app.handle(), &paths);
            documents::queue_pending(app.handle(), docs);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                let app = window.app_handle();
                documents::emit_opened(app, documents::grant_all(app, paths));
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            documents::open_pdf_dialog,
            documents::take_pending_documents,
            settings::load_settings,
            settings::save_settings,
        ])
        .build(tauri::generate_context!())
        .expect("LumiPDF failed to start")
        .run(|_app, _event| {
            // macOS delivers Finder "Open With" as an event instead of arguments.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths: Vec<_> = urls.iter().filter_map(|u| u.to_file_path().ok()).collect();
                let docs = documents::grant_all(_app, &paths);
                documents::emit_opened(_app, docs);
            }
        });
}
