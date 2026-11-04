/**
 * Live study numbers for the Library card and the Stats screen: the library's saved totals
 * plus what the study clock has counted but not saved yet.
 */
import { dayKey } from "../app/dates";
import { library } from "../library/library.svelte";
import { settings } from "../settings/store.svelte";
import { studyClock } from "../timer/study.svelte";
import { currentStreak } from "./stats";

class StudyStats {
  /** Per-day totals including today's unsaved time. */
  readonly days = $derived.by(() => {
    const saved = library.view?.studyDays ?? {};
    const unsaved = studyClock.unsavedToday;
    if (!unsaved) return saved;
    const today = dayKey(new Date());
    return { ...saved, [today]: (saved[today] ?? 0) + unsaved };
  });
  readonly today = $derived(studyClock.todaySeconds);
  readonly goal = $derived(settings.value.study.goal * 60);
  readonly progress = $derived(this.goal > 0 ? this.today / this.goal : 0);
  readonly streak = $derived(currentStreak(this.days, new Date()));
}

export const studyStats = new StudyStats();
