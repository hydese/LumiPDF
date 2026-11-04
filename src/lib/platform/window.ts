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

/** Shows, restores and focuses the window (when a timer rings). */
export function bringWindowToFront(): void {
  const win = current();
  if (!win) return;
  void (async () => {
    try {
      await win.show();
      await win.unminimize();
      await win.setFocus();
      await win.requestUserAttention(2); // informational flash in the taskbar
    } catch {
      // Not allowed or not supported: the bell still rings.
    }
  })();
}

/**
 * Lets `shouldAsk` veto closing the window: when it returns true, closing is cancelled and
 * `onAsk` is called (to show the "keep running?" dialog). Returns a cleanup function.
 */
export function guardClose(shouldAsk: () => boolean, onAsk: () => void): () => void {
  const win = current();
  if (!win) return () => {};
  const unlisten = win.onCloseRequested((event) => {
    if (shouldAsk()) {
      event.preventDefault();
      onAsk();
    }
  });
  return () => void unlisten.then((stop) => stop());
}

/** Closes for real, skipping the close guard. */
export const quitApp = () => void current()?.destroy();

/** Full screen on or off. Resolves to the new state. */
export async function setFullscreen(on: boolean): Promise<boolean> {
  const w = current();
  if (!w) {
    // Browser preview: the page's own fullscreen.
    if (on) await document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    return on;
  }
  await w.setFullscreen(on).catch(() => {});
  const state: unknown = await w.isFullscreen().catch(() => on);
  return typeof state === "boolean" ? state : on;
}

/** Calls `handler` with the maximized state now and whenever it changes. */
export function watchMaximized(handler: (maximized: boolean) => void): () => void {
  const win = current();
  if (!win) return () => {};
  const update = () => void win.isMaximized().then(handler, () => {});
  update();
  const unlisten = win.onResized(update);
  return () => void unlisten.then((stop) => stop());
}
