/** Chrono: a stopwatch with laps. */
import { timerChanged } from "./bus";

const TICK_MS = 100;

export interface ChronoState {
  running: boolean;
  elapsedMs: number;
  laps: number[];
  startedAt: number;
  base: number;
}

class Chrono {
  running = $state(false);
  elapsedMs = $state(0);
  /** Lap split times (elapsed at each lap), oldest first. */
  laps = $state<number[]>([]);
  #startedAt = 0;
  #base = 0;
  #interval: ReturnType<typeof setInterval> | null = null;

  readonly active = $derived(this.running || this.elapsedMs > 0);

  start(): void {
    if (this.running) return;
    this.#base = this.elapsedMs;
    this.#startedAt = Date.now();
    this.#run();
    timerChanged();
  }

  #run(): void {
    this.running = true;
    this.#interval = setInterval(() => (this.elapsedMs = this.#base + Date.now() - this.#startedAt), TICK_MS);
  }

  snapshot(): ChronoState {
    return { running: this.running, elapsedMs: this.elapsedMs, laps: [...this.laps], startedAt: this.#startedAt, base: this.#base };
  }

  /** Another window's state (shared timers). */
  apply(s: ChronoState): void {
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
    this.running = false;
    this.#base = s.base;
    this.#startedAt = s.startedAt;
    this.laps = s.laps;
    this.elapsedMs = s.running ? s.base + Date.now() - s.startedAt : s.elapsedMs;
    if (s.running) this.#run();
  }

  pause(): void {
    if (!this.running) return;
    this.elapsedMs = this.#base + Date.now() - this.#startedAt;
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
    this.running = false;
    timerChanged();
  }

  toggle(): void {
    if (this.running) this.pause();
    else this.start();
  }

  lap(): void {
    if (!this.running) return;
    this.laps = [...this.laps, this.#base + Date.now() - this.#startedAt];
    timerChanged();
  }

  reset(): void {
    this.pause();
    this.elapsedMs = 0;
    this.laps = [];
    timerChanged();
  }
}

export const chrono = new Chrono();
