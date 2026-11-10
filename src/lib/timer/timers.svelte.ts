/**
 * The four timer modes together: what the top bar pill shows, whether you're studying, and
 * whether closing the app should ask first.
 */
import { settings } from "../settings/store.svelte";
import type { TimerMode } from "../settings/schema";
import { alarm } from "./alarm.svelte";
import { chrono } from "./chrono.svelte";
import { countdown } from "./countdown.svelte";
import { formatAlarm, formatClock, formatStopwatch } from "./format";
import { pomodoro } from "./pomodoro.svelte";
import { onTimerChange, quietly, setTimerOwner } from "./bus";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { windowRole } from "../app/windowRole.svelte";

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
    if (alarm.armed) return { mode: "alarm", text: formatAlarm(settings.value.timer.alarm, settings.value.timer.clock24), progress: null, running: true, colour: "var(--text)" };
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

  /**
   * Shares the timers with the other windows: this window's changes go out, theirs come in,
   * and a new window starts from the current state. Only the primary window rings.
   */
  share(): () => void {
    setTimerOwner(() => windowRole.primary);
    let queued = false;
    onTimerChange(() => {
      if (queued) return;
      queued = true;
      // One message per action, even when it changes several things (a Pomodoro phase change).
      queueMicrotask(() => {
        queued = false;
        const state = JSON.stringify({ countdown: countdown.snapshot(), pomodoro: pomodoro.snapshot(), chrono: chrono.snapshot(), alarm: alarm.snapshot() });
        void invoke("timers_publish", { state }).catch(() => {});
      });
    });
    const apply = (json: string | null) => {
      if (!json) return;
      try {
        const s = JSON.parse(json) as SharedTimers;
        quietly(() => {
          countdown.apply(s.countdown);
          pomodoro.apply(s.pomodoro);
          chrono.apply(s.chrono);
          alarm.apply(s.alarm);
        });
      } catch {
        // A malformed state is ignored: this window keeps its own.
      }
    };
    void invoke<string | null>("timers_get").then(apply).catch(() => {});
    let stop: (() => void) | null = null;
    let closed = false;
    try {
      void getCurrentWebviewWindow()
        .listen<string>("timers-state", (e) => apply(e.payload))
        .then((u) => (closed ? u() : (stop = u)));
    } catch {
      // Browser preview: one window only.
    }
    return () => {
      closed = true;
      onTimerChange(null);
      stop?.();
    };
  }
}

interface SharedTimers {
  countdown: ReturnType<typeof countdown.snapshot>;
  pomodoro: ReturnType<typeof pomodoro.snapshot>;
  chrono: ReturnType<typeof chrono.snapshot>;
  alarm: ReturnType<typeof alarm.snapshot>;
}

export const timers = new Timers();
