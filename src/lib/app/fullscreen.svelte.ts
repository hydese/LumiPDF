/**
 * Full screen (F11, or the button in the reader's top bar). The top bar hides and slides back
 * when the pointer reaches the top edge of the screen. F11 or Esc leaves.
 */
import { setFullscreen } from "../platform/window";

class Fullscreen {
  on = $state(false);

  async toggle(): Promise<void> {
    this.on = await setFullscreen(!this.on);
  }

  async exit(): Promise<void> {
    if (this.on) this.on = await setFullscreen(false);
  }
}

export const fullscreen = new Fullscreen();
