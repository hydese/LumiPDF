/**
 * The window frame. On Windows and Linux LumiPDF draws its own title bar (the window has no
 * system frame); on macOS the system traffic lights stay and sit over the title bar.
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { detectPlatform } from "./shortcuts";

export const platform = detectPlatform(navigator.userAgent);
/** Draw minimize/maximize/close buttons ourselves (not on macOS). */
export const customCaptionButtons = platform !== "macos";

function current() {
  try {
    return getCurrentWindow();
  } catch {
    return null; // not running inside Tauri (browser preview, tests)
  }
}

export const minimizeWindow = () => void current()?.minimize();
export const toggleMaximizeWindow = () => void current()?.toggleMaximize();
export const closeWindow = () => void current()?.close();

/** Calls `handler` with the maximized state now and whenever it changes. */
export function watchMaximized(handler: (maximized: boolean) => void): () => void {
  const win = current();
  if (!win) return () => {};
  const update = () => void win.isMaximized().then(handler, () => {});
  update();
  const unlisten = win.onResized(update);
  return () => void unlisten.then((stop) => stop());
}
