/** Shows "What's new" once after an update (or on request from Settings › About). */
import { settings } from "../settings/store.svelte";
import { notesFor, whatsNewOnLaunch, type ReleaseNotes } from "./whatsnew";

class WhatsNew {
  notes = $state<ReleaseNotes | null>(null);
  previousVersion = $state("");

  /** Call after settings are loaded. */
  onLaunch(): void {
    const current = __APP_VERSION__;
    const lastSeen = settings.value.app.lastSeenVersion;
    const { show, remember } = whatsNewOnLaunch(current, lastSeen);
    if (show) {
      this.previousVersion = lastSeen;
      this.notes = show;
    } else if (remember) {
      settings.update((s) => (s.app.lastSeenVersion = current));
    }
  }

  showCurrent(): void {
    this.previousVersion = "";
    this.notes = notesFor(__APP_VERSION__);
  }

  dismiss(): void {
    this.notes = null;
    settings.update((s) => (s.app.lastSeenVersion = __APP_VERSION__));
  }
}

export const whatsNew = new WhatsNew();
