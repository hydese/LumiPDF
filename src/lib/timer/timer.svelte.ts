/**
 * The study (Pomodoro) timer: focus sessions and breaks with lengths the user chooses.
 * Breaks start on their own when a focus session ends; the next focus session waits for the user.
 */
import { settings } from "../settings/store.svelte";
import { playBell } from "./bell";

export type Phase = "focus" | "short" | "long";

const TICK_MS = 250;

class StudyTimer {
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
  /** True once the timer has been used (shown in the top bar while true). */
  readonly active = $derived(this.running || this.remainingMs !== this.totalMs || this.phase !== "focus" || this.session > 1);

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
    if (!this.running && this.remainingMs === this.#fullAtStart) {
      this.remainingMs = this.durationMs(this.phase);
      this.#fullAtStart = this.remainingMs;
    }
  }

  start(): void {
    if (this.running) return;
    if (this.remainingMs <= 0) this.remainingMs = this.durationMs(this.phase);
    this.#endsAt = Date.now() + this.remainingMs;
    this.running = true;
    this.#interval = setInterval(() => this.#tick(), TICK_MS);
  }

  pause(): void {
    if (!this.running) return;
    this.remainingMs = Math.max(0, this.#endsAt - Date.now());
    this.#stop();
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
  }

  /** Ends the current phase now and moves to the next one. */
  skip(): void {
    this.#advance(false);
  }

  #tick(): void {
    this.remainingMs = Math.max(0, this.#endsAt - Date.now());
    if (this.remainingMs === 0) this.#advance(true);
  }

  #advance(finished: boolean): void {
    this.#stop();
    if (finished && settings.value.timer.sound) playBell();
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
  }

  #stop(): void {
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
    this.running = false;
  }
}

/** "36:48", or "1:05:00" for an hour or more. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm.padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const timer = new StudyTimer();
