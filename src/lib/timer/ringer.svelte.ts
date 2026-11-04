/**
 * Sounds and "time's up". A Timer or Alarm keeps ringing (a soft bell every few seconds) and
 * brings the LumiPDF window to the front until it is stopped or snoozed; Pomodoro phases
 * just chime once.
 */
import { settings } from "../settings/store.svelte";
import { bringWindowToFront } from "../platform/window";
import { playBell } from "./bell";

const REPEAT_MS = 4000;
/** Stop ringing on its own after this long, like a phone alarm. */
const GIVE_UP_MS = 3 * 60_000;

export type RingSource = "timer" | "alarm";

class Ringer {
  ringing = $state<RingSource | null>(null);
  #onStop: () => void = () => {};
  #onSnooze: () => void = () => {};
  #repeat: ReturnType<typeof setInterval> | null = null;
  #giveUp: ReturnType<typeof setTimeout> | null = null;

  ring(source: RingSource, onStop: () => void, onSnooze: () => void): void {
    this.#clear();
    this.ringing = source;
    this.#onStop = onStop;
    this.#onSnooze = onSnooze;
    playBell();
    this.#repeat = setInterval(playBell, REPEAT_MS);
    this.#giveUp = setTimeout(() => this.stop(), GIVE_UP_MS);
    bringWindowToFront();
  }

  /** One soft chime (Pomodoro phase changes), if sounds are on. */
  chime(_reason: "focusDone" | "breakDone"): void {
    if (settings.value.timer.sound) playBell();
  }

  stop(): void {
    const done = this.#onStop;
    this.#clear();
    done();
  }

  snooze(): void {
    const snooze = this.#onSnooze;
    this.#clear();
    snooze();
  }

  #clear(): void {
    if (this.#repeat) clearInterval(this.#repeat);
    if (this.#giveUp) clearTimeout(this.#giveUp);
    this.#repeat = this.#giveUp = null;
    this.ringing = null;
  }
}

export const ringer = new Ringer();
