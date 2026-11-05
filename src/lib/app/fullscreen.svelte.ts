/**
 * Full screen (F11 / ⌃⌘F, or the button in the reader's top bar). The top bar hides and slides
 * back when the pointer reaches the top edge of the screen. F11 or Esc leaves.
 *
 * On the Mac, the green window button would enter macOS's own full screen, whose title bar
 * slides over LumiPDF's top bar; that is switched to LumiPDF's full screen as soon as it happens.
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform, setFullscreen } from "../platform/window";

class Fullscreen {
  on = $state(false);
  #busy = false;

  async toggle(): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      this.on = await setFullscreen(!this.on);
    } finally {
      this.#busy = false;
    }
  }

  async exit(): Promise<void> {
    if (this.on) this.on = await setFullscreen(false);
  }

  /** Mac: catch the green button's native full screen. Returns a cleanup function. */
  watchNative(): () => void {
    if (platform !== "macos") return () => {};
    let win: ReturnType<typeof getCurrentWindow>;
    try {
      win = getCurrentWindow();
    } catch {
      return () => {};
    }
    const unlisten = win.onResized(() => {
      if (this.#busy || this.on) return;
      void win.isFullscreen().then(async (native) => {
        if (!native || this.#busy || this.on) return;
        this.#busy = true;
        try {
          this.on = await setFullscreen(true);
        } finally {
          this.#busy = false;
        }
      });
    });
    return () => void unlisten.then((stop) => stop());
  }
}

export const fullscreen = new Fullscreen();
