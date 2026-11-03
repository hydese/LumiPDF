/**
 * Counts study time: while a document is open and you're actively reading (window focused,
 * some input in the last few minutes), or while a focus session runs. Time is saved to the
 * library every minute: per document and per day.
 */
import { dayKey } from "../app/dates";
import { navigation } from "../app/navigation.svelte";
import { libraryAddStudyTime, libraryUpdate } from "../ipc/library";
import { library } from "../library/library.svelte";
import { session } from "../reader/session.svelte";
import { timer } from "./timer.svelte";

const TICK_S = 15;
const FLUSH_EVERY_TICKS = 4;
const IDLE_AFTER_MS = 3 * 60_000;

class StudyClock {
  /** Seconds not yet saved, so totals shown in the UI stay live. */
  unsavedToday = $state(0);
  #docSeconds = new Map<string, number>();
  #daySeconds = 0;
  #lastInput = Date.now();
  #ticks = 0;

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
    const present = document.visibilityState === "visible" && document.hasFocus() && Date.now() - this.#lastInput < IDLE_AFTER_MS;
    const reading = present && navigation.screen === "reader" && session.current !== null;
    const focusing = timer.running && timer.phase === "focus";
    if (reading) {
      const path = session.current!.ref.path;
      this.#docSeconds.set(path, (this.#docSeconds.get(path) ?? 0) + TICK_S);
    } else if (focusing) {
      this.#daySeconds += TICK_S;
    }
    if (reading || focusing) this.unsavedToday += TICK_S;
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
    if (library.view) library.view.studyDays[day] = (library.view.studyDays[day] ?? 0) + saved;
    for (const [path, seconds] of docs) await libraryUpdate(path, { studySeconds: seconds, day }).catch(() => {});
    if (dayOnly) await libraryAddStudyTime(day, dayOnly).catch(() => {});
  }
}

export const studyClock = new StudyClock();
