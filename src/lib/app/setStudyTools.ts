/** Turns study tools on or off (welcome, Settings, the Library hint). */
import type { StudySettings } from "../settings/schema";
import { settings } from "../settings/store.svelte";
import { session } from "../reader/session.svelte";
import { navigation } from "./navigation.svelte";
import { studyTools } from "./studyTools.svelte";

export function setStudyTools(patch: Partial<Pick<StudySettings, "tools" | "timer" | "stats" | "sheets">>): void {
  settings.update((s) => Object.assign(s.study, patch));
  // Formula sheet tabs close when sheets are turned off (the sheets themselves are kept).
  if (!studyTools.sheets) {
    for (const tab of session.tabs.filter((t) => t.kind === "sheet")) void session.close(tab.id);
  }
  if (!studyTools.stats && navigation.screen === "stats") navigation.go("library");
  // Closing the last sheet tab from Settings must not leave Settings (App handles the rest).
}
