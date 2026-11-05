/**
 * While a timer is running, the hidden or minimised window must keep its timers on time.
 * Chromium (WebView2, Windows) slows the timers of hidden pages to once a minute after a while,
 * except in pages holding a Web Lock, so one is held while a timer runs. (macOS: the window's
 * background throttling is turned off in tauri.macos.conf.json.)
 */
let release: (() => void) | null = null;

export function keepTimersAwake(on: boolean): void {
  if (on === (release !== null)) return;
  if (!on) {
    release?.();
    release = null;
    return;
  }
  if (!("locks" in navigator)) return;
  void navigator.locks
    .request("lumipdf-timer", () => new Promise<void>((resolve) => (release = resolve)))
    .catch(() => (release = null));
}
