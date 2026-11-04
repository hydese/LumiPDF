/** Alarm: rings at a clock time while LumiPDF is open (or minimized). */
import { settings } from "../settings/store.svelte";
import { msUntil } from "./format";
import { ringer } from "./ringer.svelte";

const CHECK_MS = 1000;
const SNOOZE_MIN = 5;

class Alarm {
  armed = $state(false);
  /** Milliseconds left until it rings (updated every second while armed). */
  remainingMs = $state(0);
  #at = 0;
  #interval: ReturnType<typeof setInterval> | null = null;

  arm(): void {
    this.#schedule(Date.now() + msUntil(settings.value.timer.alarm, new Date()));
  }

  disarm(): void {
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
    this.armed = false;
  }

  toggle(): void {
    if (this.armed) this.disarm();
    else this.arm();
  }

  /** The time was changed: an armed alarm moves to the new time. */
  syncWithSettings(): void {
    if (this.armed) this.arm();
  }

  #schedule(at: number): void {
    this.disarm();
    this.#at = at;
    this.armed = true;
    this.remainingMs = at - Date.now();
    this.#interval = setInterval(() => this.#check(), CHECK_MS);
  }

  #check(): void {
    this.remainingMs = Math.max(0, this.#at - Date.now());
    if (this.remainingMs > 0) return;
    this.disarm();
    ringer.ring("alarm", () => {}, () => this.#schedule(Date.now() + SNOOZE_MIN * 60_000));
  }
}

export const alarm = new Alarm();
