/** Alarm: rings at a clock time while LumiPDF is open (or minimized). */
import { settings } from "../settings/store.svelte";
import { msUntil } from "./format";
import { ringer } from "./ringer.svelte";
import { isTimerOwner, timerChanged } from "./bus";

export interface AlarmState {
  armed: boolean;
  at: number;
}

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
    this.#off();
    timerChanged();
  }

  #off(): void {
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
    this.armed = false;
  }

  snapshot(): AlarmState {
    return { armed: this.armed, at: this.#at };
  }

  /** Another window's state (shared timers). */
  apply(s: AlarmState): void {
    this.#off();
    if (!s.armed) return;
    this.#at = s.at;
    this.armed = true;
    this.remainingMs = Math.max(0, s.at - Date.now());
    this.#interval = setInterval(() => this.#check(), CHECK_MS);
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
    this.#off();
    this.#at = at;
    this.armed = true;
    this.remainingMs = at - Date.now();
    this.#interval = setInterval(() => this.#check(), CHECK_MS);
    timerChanged();
  }

  #check(): void {
    this.remainingMs = Math.max(0, this.#at - Date.now());
    if (this.remainingMs > 0) return;
    if (!isTimerOwner()) {
      // The primary window rings; this one waits for its new state.
      if (this.#interval) clearInterval(this.#interval);
      this.#interval = null;
      return;
    }
    this.disarm();
    ringer.ring("alarm", () => {}, () => this.#schedule(Date.now() + SNOOZE_MIN * 60_000));
  }
}

export const alarm = new Alarm();
