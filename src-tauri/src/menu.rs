//! The macOS menu bar (other platforms have no menu: LumiPDF draws its own title bar).
//!
//! Tauri's default Mac menu would close the whole window on ⌘W and quit without saving on ⌘Q,
//! so LumiPDF builds its own. Items that are LumiPDF actions are sent to the frontend as a
//! "menu" event with the item's id (the frontend runs the same code as its keyboard shortcuts);
//! clipboard, hide and minimize use the system's own items.
//!
//! The labels come from the frontend (`set_menu`), in the user's language; until then the menu
//! is in English.

use serde::Deserialize;
use tauri::{AppHandle, Runtime};

/// The event the frontend listens to; the payload is the item id ("settings", "quit"…).
pub const MENU_EVENT: &str = "menu";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub struct MenuLabels {
    pub about: String,
    pub settings: String,
    pub services: String,
    pub hide: String,
    pub hide_others: String,
    pub show_all: String,
    pub quit: String,
    pub file: String,
    pub open: String,
    pub close_tab: String,
    pub export: String,
    pub edit: String,
    pub undo: String,
    pub redo: String,
    pub cut: String,
    pub copy: String,
    pub paste: String,
    pub select_all: String,
    pub find: String,
    pub view: String,
    pub fullscreen: String,
    pub window: String,
    pub minimize: String,
    pub zoom: String,
    pub help: String,
    pub github: String,
}

impl Default for MenuLabels {
    fn default() -> Self {
        let s = |v: &str| v.to_owned();
        Self {
            about: s("About LumiPDF"),
            settings: s("Settings…"),
            services: s("Services"),
            hide: s("Hide LumiPDF"),
            hide_others: s("Hide Others"),
            show_all: s("Show All"),
            quit: s("Quit LumiPDF"),
            file: s("File"),
            open: s("Open…"),
            close_tab: s("Close Tab"),
            export: s("Export a Copy…"),
            edit: s("Edit"),
            undo: s("Undo"),
            redo: s("Redo"),
            cut: s("Cut"),
            copy: s("Copy"),
            paste: s("Paste"),
            select_all: s("Select All"),
            find: s("Find…"),
            view: s("View"),
            fullscreen: s("Enter Full Screen"),
            window: s("Window"),
            minimize: s("Minimize"),
            zoom: s("Zoom"),
            help: s("Help"),
            github: s("LumiPDF on GitHub"),
        }
    }
}

/// Builds the menu and installs it (macOS only; does nothing elsewhere).
#[cfg(target_os = "macos")]
pub fn install<R: Runtime>(app: &AppHandle<R>, l: &MenuLabels) -> tauri::Result<()> {
    use tauri::menu::{AboutMetadata, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
    use tauri::Manager;

    let item = |id: &str, text: &str, accel: Option<&str>| MenuItem::with_id(app, id, text, true, accel);
    let about = AboutMetadata {
        name: Some("LumiPDF".into()),
        version: Some(app.package_info().version.to_string()),
        ..Default::default()
    };
    let app_menu = SubmenuBuilder::new(app, "LumiPDF")
        .item(&PredefinedMenuItem::about(app, Some(&l.about), Some(about))?)
        .separator()
        .item(&item("settings", &l.settings, Some("Cmd+Comma"))?)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some(&l.services))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(&l.hide))?)
        .item(&PredefinedMenuItem::hide_others(app, Some(&l.hide_others))?)
        .item(&PredefinedMenuItem::show_all(app, Some(&l.show_all))?)
        .separator()
        .item(&item("quit", &l.quit, Some("Cmd+Q"))?)
        .build()?;
    let file = SubmenuBuilder::new(app, &l.file)
        .item(&item("open", &l.open, Some("Cmd+O"))?)
        .item(&item("close-tab", &l.close_tab, Some("Cmd+W"))?)
        .separator()
        .item(&item("export", &l.export, Some("Cmd+E"))?)
        .build()?;
    let edit = SubmenuBuilder::new(app, &l.edit)
        .item(&item("undo", &l.undo, Some("Cmd+Z"))?)
        .item(&item("redo", &l.redo, Some("Cmd+Shift+Z"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(&l.cut))?)
        .item(&PredefinedMenuItem::copy(app, Some(&l.copy))?)
        .item(&PredefinedMenuItem::paste(app, Some(&l.paste))?)
        .item(&PredefinedMenuItem::select_all(app, Some(&l.select_all))?)
        .separator()
        .item(&item("find", &l.find, Some("Cmd+F"))?)
        .build()?;
    let view = SubmenuBuilder::new(app, &l.view)
        .item(&item("fullscreen", &l.fullscreen, Some("Ctrl+Cmd+F"))?)
        .build()?;
    let window = SubmenuBuilder::new(app, &l.window)
        .item(&PredefinedMenuItem::minimize(app, Some(&l.minimize))?)
        .item(&PredefinedMenuItem::maximize(app, Some(&l.zoom))?)
        .build()?;
    let help = SubmenuBuilder::new(app, &l.help)
        .item(&item("github", &l.github, None)?)
        .build()?;
    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file, &edit, &view, &window, &help])
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn install<R: Runtime>(_app: &AppHandle<R>, _labels: &MenuLabels) -> tauri::Result<()> {
    Ok(())
}

/// Rebuilds the menu in the user's language (called by the frontend at startup and when the
/// language changes). Does nothing outside macOS.
#[tauri::command]
pub fn set_menu<R: Runtime>(app: AppHandle<R>, labels: MenuLabels) -> Result<(), crate::AppError> {
    install(&app, &labels).map_err(|e| crate::AppError::InvalidInput(e.to_string()))
}
