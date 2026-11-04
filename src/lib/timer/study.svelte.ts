/**
 * Counts study time.
 *
 * - While a Timer, Pomodoro focus session or Chrono runs, that time counts (and goes to the open
 *   document too, if you're reading one).
 * - With no timer running, reading counts once you've been reading for 10 minutes in a row
 *   (window in front, some input in the last 5 minutes); those first 10 minutes count too.
 *   Shorter glances don't count.
 *
 * Time is saved to the library every minute: per document and per day.
 */
import { dayKey } from "../app/dates";
import { navigation } from "../app/navigation.svelte";
import { libraryAddStudyTime, libraryUpdate } from "../ipc/library";
import { library } from "../library/library.svelte";
import { session } from "../reader/session.svelte";
import { timers } from "./timers.svelte";
import { studyTools } from "../app/studyTools.svelte";

const TICK_S = 15;
const FLUSH_EVERY_TICKS = 4;
const IDLE_AFTER_MS = 5 * 60_000;
/** Reading without a timer counts once a session reaches this length. */
export const READING_THRESHOLD_S = 10 * 60;

export interface StudyTick {
  /** A timer that measures study is running. */
  timing: boolean;
  /** The user is reading a document right now. */
  reading: boolean;
}

/**
 * Pure rule, testable: given the current reading run and this tick, returns the seconds to count
 * now and the new run length. `pending` is the run time not yet counted.
 */
export function studyStep(run: number, pending: number, tick: StudyTick, step: number): { count: number; run: number; pending: number } {
  if (tick.timing) return { count: step, run: tick.reading ? run + step : 0, pending: 0 };
  if (!tick.reading) return { count: 0, run: 0, pending: 0 };
  const nextRun = run + step;
  if (nextRun < READING_THRESHOLD_S) return { count: 0, run: nextRun, pending: pending + step };
  return { count: pending + step, run: nextRun, pending: 0 };
}

class StudyClock {
  /** Seconds counted but not yet saved, so totals shown in the UI stay live. */
  unsavedToday = $state(0);
  #docSeconds = new Map<string, number>();
  #daySeconds = 0;
  #lastInput = Date.now();
  #ticks = 0;
  #run = 0;
  #pending = 0;
  #pendingDoc: string | null = null;

  readonly todaySeconds = $derived((library.view?.studyDays[dayKey(new Date())] ?? 0) + this.unsavedToday);

  start(): () => void {
    const onInput = () => (this.#lastInput = Date.now());
    const events = ["pointerdown", "keydown", "wheel", "pointermove"] as const;
    for (const e of events) window.addEventListener(e, onInput, { passive: true });
    const interval = setInterval(() => this.#tick(), TICK_S * 1000);
    const onHide = () => void this.flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      for (const e of events) window.removeEventListener(e, onInput);
      window.removeEventListener("pagehide", onHide);
      clearInterval(interval);
      void this.flush();
    };
  }

  #tick(): void {
    if (!studyTools.stats) {
      this.#run = this.#pending = 0;
      return;
    }
    const present = document.visibilityState === "visible" && document.hasFocus() && Date.now() - this.#lastInput < IDLE_AFTER_MS;
    const doc = navigation.screen === "reader" ? (session.current?.ref.path ?? null) : null;
    const reading = present && doc !== null;
    if (doc !== this.#pendingDoc) {
      // Switched document: the reading run starts over.
      this.#run = this.#pending = 0;
      this.#pendingDoc = doc;
    }
    const step = studyStep(this.#run, this.#pending, { timing: timers.studying, reading }, TICK_S);
    this.#run = step.run;
    this.#pending = step.pending;
    if (step.count) {
      if (reading && doc) this.#docSeconds.set(doc, (this.#docSeconds.get(doc) ?? 0) + step.count);
      else this.#daySeconds += step.count;
      this.unsavedToday += step.count;
    }
    if (++this.#ticks % FLUSH_EVERY_TICKS === 0) void this.flush();
  }

  async flush(): Promise<void> {
    const day = dayKey(new Date());
    const docs = [...this.#docSeconds];
    const dayOnly = this.#daySeconds;
    const saved = this.unsavedToday;
    this.#docSeconds.clear();
    this.#daySeconds = 0;
    this.unsavedToday = 0;
    if (!saved) return;
    // Keep the shown total right without rescanning the library.
    if (library.view) {
      library.view.studyDays[day] = (library.view.studyDays[day] ?? 0) + saved;
      for (const [path, seconds] of docs) {
        const doc = library.view.documents.find((d) => d.path === path);
        if (!doc) continue;
        doc.studySeconds += seconds;
        doc.studyDays ??= {};
        doc.studyDays[day] = (doc.studyDays[day] ?? 0) + seconds;
      }
    }
    for (const [path, seconds] of docs) await libraryUpdate(path, { studySeconds: seconds, day }).catch(() => {});
    if (dayOnly) await libraryAddStudyTime(day, dayOnly).catch(() => {});
  }
}

export const studyClock = new StudyClock();
