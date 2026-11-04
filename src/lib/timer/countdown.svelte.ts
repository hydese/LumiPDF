/** Timer: one countdown of any length; rings until stopped. */
import { settings } from "../settings/store.svelte";
import { ringer } from "./ringer.svelte";

const TICK_MS = 250;

class Countdown {
  running = $state(false);
  remainingMs = $state(0);
  #endsAt = 0;
  #interval: ReturnType<typeof setInterval> | null = null;

  readonly totalMs = $derived(settings.value.timer.countdown * 60_000);
  readonly progress = $derived(this.totalMs > 0 ? Math.min(1, Math.max(0, 1 - this.remainingMs / this.totalMs)) : 0);
  /** Started (running or paused part-way). */
  readonly active = $derived(this.running || (this.remainingMs > 0 && this.remainingMs < this.totalMs));

  /** Shown length while stopped at the start follows the setting. */
  readonly shownMs = $derived(this.active ? this.remainingMs : this.totalMs);

  start(): void {
    if (this.running) return;
    if (!this.active) this.remainingMs = this.totalMs;
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

  reset(): void {
    this.#stop();
    this.remainingMs = 0;
  }

  /** Adds minutes to a running or paused countdown (e.g. "+5 min" when it rings). */
  extend(minutes: number): void {
    if (this.running) this.#endsAt += minutes * 60_000;
    else this.remainingMs += minutes * 60_000;
  }

  #tick(): void {
    this.remainingMs = Math.max(0, this.#endsAt - Date.now());
    if (this.remainingMs === 0) {
      this.#stop();
      ringer.ring("timer", () => this.reset(), () => {
        this.remainingMs = 5 * 60_000;
        this.start();
      });
    }
  }

  #stop(): void {
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
    this.running = false;
  }
}

export const countdown = new Countdown();
