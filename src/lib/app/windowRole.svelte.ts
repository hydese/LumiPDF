/**
 * Which job this window has (windows.rs). Every window is independent; one of them, the
 * primary one (at start the first window), also remembers the open tabs for the next start,
 * checks for updates and rings the timers. When it closes, another window takes the role over.
 */
import { invoke } from "@tauri-apps/api/core";
import { onWindowEvent, windowLabel } from "../ipc/windows";

class WindowRole {
  primary = $state(windowLabel === "main");
  #took: Array<() => void> = [];

  /** Asks which role this window has and listens for the hand-over. Returns a cleanup. */
  start(): () => void {
    void invoke<boolean>("window_is_primary")
      .then((p) => this.#set(p))
      .catch(() => {});
    const stop = onWindowEvent<null>("window-primary", () => this.#set(true));
    return () => void stop.then((u) => u());
  }

  /** Runs `fn` whenever this window becomes the primary one after starting. */
  onTakeOver(fn: () => void): void {
    this.#took.push(fn);
  }

  #set(primary: boolean): void {
    const took = primary && !this.primary;
    this.primary = primary;
    if (took) for (const fn of this.#took) fn();
  }
}

export const windowRole = new WindowRole();

/** How many LumiPDF windows are open (1 in the browser preview). */
export const windowCount = () => invoke<number>("window_count").catch(() => 1);

/** Whether any LumiPDF window is in front. */
export const anyWindowFocused = () => invoke<boolean>("window_any_focused").catch(() => document.hasFocus());
