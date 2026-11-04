/**
 * The four timer modes together: what the top bar pill shows, whether you're studying, and
 * whether closing the app should ask first.
 */
import { settings } from "../settings/store.svelte";
import type { TimerMode } from "../settings/schema";
import { alarm } from "./alarm.svelte";
import { chrono } from "./chrono.svelte";
import { countdown } from "./countdown.svelte";
import { formatClock, formatStopwatch } from "./format";
import { pomodoro } from "./pomodoro.svelte";

export interface PillInfo {
  mode: TimerMode;
  text: string;
  /** 0..1 for a progress ring, or null for no ring (stopwatch, alarm). */
  progress: number | null;
  running: boolean;
  colour: string;
}

class Timers {
  /** The pill in the top bar: the running countdown first, then pomodoro, stopwatch, alarm. */
  readonly pill = $derived.by((): PillInfo | null => {
    if (countdown.active)
      return { mode: "timer", text: formatClock(countdown.remainingMs), progress: countdown.progress, running: countdown.running, colour: "var(--accent)" };
    if (pomodoro.active)
      return {
        mode: "pomodoro",
        text: formatClock(pomodoro.remainingMs),
        progress: pomodoro.progress,
        running: pomodoro.running,
        colour: pomodoro.phase === "focus" ? "var(--timer)" : "var(--ok)",
      };
    if (chrono.active) return { mode: "chrono", text: formatStopwatch(chrono.elapsedMs).replace(/\.\d$/, ""), progress: null, running: chrono.running, colour: "var(--text)" };
    if (alarm.armed) return { mode: "alarm", text: settings.value.timer.alarm, progress: null, running: true, colour: "var(--text)" };
    return null;
  });

  /** A timer is measuring study time right now (Timer, Pomodoro focus or Chrono running). */
  readonly studying = $derived(countdown.running || pomodoro.studying || chrono.running);

  /** Something would be lost or not ring if the app closed now. */
  readonly busy = $derived(countdown.running || pomodoro.running || chrono.running || alarm.armed);

  /** Start/pause whatever the current tab controls (keyboard shortcut). */
  toggleCurrent(): void {
    const mode = settings.value.timer.mode;
    if (mode === "timer") countdown.toggle();
    else if (mode === "pomodoro") pomodoro.toggle();
    else if (mode === "alarm") alarm.toggle();
    else chrono.toggle();
  }

  syncWithSettings(): void {
    pomodoro.syncWithSettings();
    alarm.syncWithSettings();
  }
}

export const timers = new Timers();
