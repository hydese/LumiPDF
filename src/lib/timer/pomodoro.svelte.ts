/**
 * Pomodoro: focus sessions and breaks with lengths the user chooses. Breaks start on their own
 * when a focus session ends; the next focus session waits for the user.
 */
import { settings } from "../settings/store.svelte";
import { ringer } from "./ringer.svelte";
import { isTimerOwner, timerChanged } from "./bus";

export type Phase = "focus" | "short" | "long";

const TICK_MS = 250;

export interface PomodoroState {
  phase: Phase;
  running: boolean;
  session: number;
  remainingMs: number;
  endsAt: number;
  fullAtStart: number;
}

class Pomodoro {
  phase = $state<Phase>("focus");
  running = $state(false);
  /** Focus session number within the current cycle, 1-based. */
  session = $state(1);
  remainingMs = $state(0);
  #endsAt = 0;
  #interval: ReturnType<typeof setInterval> | null = null;
  #fullAtStart = 0;

  readonly totalMs = $derived(this.durationMs(this.phase));
  readonly progress = $derived(this.totalMs > 0 ? Math.min(1, Math.max(0, 1 - this.remainingMs / this.totalMs)) : 0);
  /** Started and not back at the beginning (shown in the top bar while true). */
  readonly active = $derived(this.running || this.remainingMs !== this.totalMs || this.phase !== "focus" || this.session > 1);
  readonly studying = $derived(this.running && this.phase === "focus");

  constructor() {
    this.remainingMs = this.durationMs("focus");
    this.#fullAtStart = this.remainingMs;
  }

  durationMs(phase: Phase): number {
    const t = settings.value.timer;
    const minutes = phase === "focus" ? t.focus : phase === "short" ? t.shortBreak : t.longBreak;
    return minutes * 60_000;
  }

  /** A length was changed in settings: an untouched, stopped timer takes the new length. */
  syncWithSettings(): void {
    if (!this.running && this.remainingMs === this.#fullAtStart && this.remainingMs !== this.durationMs(this.phase)) {
      this.remainingMs = this.durationMs(this.phase);
      this.#fullAtStart = this.remainingMs;
      timerChanged();
    }
  }

  start(): void {
    if (this.running) return;
    if (this.remainingMs <= 0) this.remainingMs = this.durationMs(this.phase);
    this.#endsAt = Date.now() + this.remainingMs;
    this.running = true;
    this.#interval = setInterval(() => this.#tick(), TICK_MS);
    timerChanged();
  }

  pause(): void {
    if (!this.running) return;
    this.remainingMs = Math.max(0, this.#endsAt - Date.now());
    this.#stop();
    timerChanged();
  }

  toggle(): void {
    if (this.running) this.pause();
    else this.start();
  }

  /** Restarts the current phase from its full length (stopped). */
  reset(): void {
    this.#stop();
    this.remainingMs = this.durationMs(this.phase);
    this.#fullAtStart = this.remainingMs;
    timerChanged();
  }

  snapshot(): PomodoroState {
    return { phase: this.phase, running: this.running, session: this.session, remainingMs: this.remainingMs, endsAt: this.#endsAt, fullAtStart: this.#fullAtStart };
  }

  /** Another window's state (shared timers). */
  apply(s: PomodoroState): void {
    this.#stop();
    this.phase = s.phase;
    this.session = s.session;
    this.#endsAt = s.endsAt;
    this.#fullAtStart = s.fullAtStart;
    this.remainingMs = s.running ? Math.max(0, s.endsAt - Date.now()) : s.remainingMs;
    if (s.running) {
      this.running = true;
      this.#interval = setInterval(() => this.#tick(), TICK_MS);
    }
  }

  /** Ends the current phase now and moves to the next one. */
  skip(): void {
    this.#advance(false);
  }

  #tick(): void {
    this.remainingMs = Math.max(0, this.#endsAt - Date.now());
    if (this.remainingMs > 0) return;
    // The primary window chimes and moves on; the others wait for its new state.
    if (isTimerOwner()) return this.#advance(true);
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
  }

  #advance(finished: boolean): void {
    this.#stop();
    if (finished) ringer.chime(this.phase === "focus" ? "focusDone" : "breakDone");
    const { sessionsBeforeLong } = settings.value.timer;
    if (this.phase === "focus") {
      this.phase = this.session % sessionsBeforeLong === 0 ? "long" : "short";
    } else {
      this.session = this.phase === "long" ? 1 : this.session + 1;
      this.phase = "focus";
    }
    this.remainingMs = this.durationMs(this.phase);
    this.#fullAtStart = this.remainingMs;
    if (finished && this.phase !== "focus") this.start();
    timerChanged();
  }

  #stop(): void {
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
    this.running = false;
  }
}

export const pomodoro = new Pomodoro();
