//! Bringing LumiPDF to the front when a timer rings. The webview's own focus request is often
//! refused (Windows blocks background apps from taking focus; macOS needs the app activated),
//! so the window is shown, restored, briefly put on top of everything, and focused.

use tauri::{AppHandle, Manager, Runtime, UserAttentionType};

#[tauri::command]
pub fn bring_to_front<R: Runtime>(app: AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    #[cfg(target_os = "macos")]
    let _ = app.show(); // activates the app (un-hides it, brings it to the current space)
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();
    let _ = window.request_user_attention(Some(UserAttentionType::Informational));
    // On top only for a moment: long enough to come in front, not to stay there.
    let window = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(600));
        // Restoring from the Dock is animated on macOS, and focus is ignored until it's done.
        let _ = window.set_focus();
        let _ = window.set_always_on_top(false);
    });
}

/// Full screen without the native macOS mode (which slides a title bar over the app's own top
/// bar whenever the pointer nears the top): the window covers the screen, the menu bar and Dock
/// hide until the pointer reaches the edge. Other systems use normal full screen.
#[tauri::command]
pub async fn app_fullscreen<R: Runtime>(window: tauri::WebviewWindow<R>, on: bool) -> bool {
    #[cfg(target_os = "macos")]
    {
        // Leaving native full screen first (entered with the green button), then the simple one.
        if on && window.is_fullscreen().unwrap_or(false) {
            let _ = window.set_fullscreen(false);
            std::thread::sleep(std::time::Duration::from_millis(700));
        }
        if window.set_simple_fullscreen(on).is_ok() {
            return on;
        }
    }
    let _ = window.set_fullscreen(on);
    window.is_fullscreen().unwrap_or(on)
}
