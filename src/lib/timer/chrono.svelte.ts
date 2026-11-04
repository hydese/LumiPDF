/** Chrono: a stopwatch with laps. */
const TICK_MS = 100;

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
    this.running = true;
    this.#interval = setInterval(() => (this.elapsedMs = this.#base + Date.now() - this.#startedAt), TICK_MS);
  }

  pause(): void {
    if (!this.running) return;
    this.elapsedMs = this.#base + Date.now() - this.#startedAt;
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
    this.running = false;
  }

  toggle(): void {
    if (this.running) this.pause();
    else this.start();
  }

  lap(): void {
    if (this.running) this.laps = [...this.laps, this.#base + Date.now() - this.#startedAt];
  }

  reset(): void {
    this.pause();
    this.elapsedMs = 0;
    this.laps = [];
  }
}

export const chrono = new Chrono();
