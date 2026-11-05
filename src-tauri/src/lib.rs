//! LumiPDF desktop backend.
//!
//! The frontend renders PDFs with pdf.js; this crate owns everything that touches the disk:
//! which files the webview may read, user settings, and later the library index, annotation sidecars,
//! study stats, export and compression. Each area lives in its own module.

mod annotations;
mod cloud;
mod commands;
mod documents;
mod error;
mod export;
mod library;
mod menu;
mod perf;
mod pdf_export;
mod settings;
mod sheets;
mod store;
mod updater;

pub use error::AppError;

use tauri::{DragDropEvent, Emitter, Manager, WindowEvent};

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::PendingUpdate::default())
        .manage(documents::PendingDocuments::default())
        // macOS: LumiPDF's own menu (menu.rs) instead of Tauri's default one.
        .enable_macos_default_menu(false)
        .on_menu_event(|app, event| {
            let _ = app.emit(menu::MENU_EVENT, event.id().0.clone());
        })
        .setup(|app| {
            menu::install(app.handle(), &menu::MenuLabels::default())?;
            library::init(app.handle());
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
            menu::set_menu,
            perf::perf_log,
            updater::update_installable,
            updater::update_check,
            updater::update_download,
            updater::update_install,
            documents::open_pdf_dialog,
            documents::take_pending_documents,
            settings::load_settings,
            settings::save_settings,
            library::library_load,
            library::library_add_folder,
            library::library_remove_folder,
            library::library_open,
            library::library_update,
            library::library_add_study_time,
            library::library_reset_study,
            library::library_forget,
            annotations::annotations_load,
            annotations::annotations_save,
            export::save_png,
            export::export_pdf,
            export::pdf_protection,
            export::pdf_size_estimate,
            sheets::sheets_list,
            sheets::sheet_load,
            sheets::sheet_save,
            sheets::sheet_delete,
            sheets::sheet_add_image,
            sheets::sheet_image,
            sheets::sheet_export_pdf,
        ])
        .build(tauri::generate_context!())
        .expect("LumiPDF failed to start")
        .run(|_app, _event| {
            // macOS delivers Finder "Open With" as an event instead of arguments. At launch it
            // comes before the frontend listens, so it is also queued for take_pending_documents
            // (the frontend takes the queue once, at startup).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths: Vec<_> = urls.iter().filter_map(|u| u.to_file_path().ok()).collect();
                let docs = documents::grant_all(_app, &paths);
                documents::queue_pending(_app, docs.clone());
                documents::emit_opened(_app, docs);
            }
        });
}
