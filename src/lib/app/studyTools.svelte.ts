/**
 * Which study tools are on. "Study tools" is the main switch (chosen in the welcome: studying or
 * just reading); each tool also has its own switch in Settings → General.
 */
import { settings } from "../settings/store.svelte";

class StudyTools {
  readonly on = $derived(settings.value.study.tools);
  readonly timer = $derived(this.on && settings.value.study.timer);
  /** Study time is only counted while stats are on (off means off). */
  readonly stats = $derived(this.on && settings.value.study.stats);
  readonly sheets = $derived(this.on && settings.value.study.sheets);
}

export const studyTools = new StudyTools();
