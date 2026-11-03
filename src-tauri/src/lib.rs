//! LumiPDF desktop backend.
//!
//! The frontend renders PDFs with pdf.js; this crate owns everything that touches the disk:
//! the library index, annotation sidecars, study stats, export and compression.
//! Each area lives in its own module and exposes its Tauri commands through `commands`.

mod commands;
mod error;

pub use error::AppError;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![commands::app_info])
        .run(tauri::generate_context!())
        .expect("LumiPDF failed to start");
}
