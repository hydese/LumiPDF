/**
 * What LumiPDF shows at launch: the welcome on a first install (or the welcome steps an update
 * asks for), then "What's new" once after an update. Both can be reopened from Settings › About.
 */
import { settings } from "../settings/store.svelte";
import { notesFor, whatsNewOnLaunch, WELCOME_STEPS, type ReleaseNotes, type WelcomeStep } from "./whatsnew";

class WhatsNew {
  notes = $state<ReleaseNotes | null>(null);
  previousVersion = $state("");
  welcome = $state<WelcomeStep[] | null>(null);
  #pendingNotes: ReleaseNotes | null = null;

  /** Call after settings are loaded. */
  onLaunch(): void {
    const current = __APP_VERSION__;
    const lastSeen = settings.value.app.lastSeenVersion;
    const plan = whatsNewOnLaunch(current, lastSeen);
    this.previousVersion = lastSeen;
    if (plan.welcome.length) {
      this.welcome = plan.welcome;
      this.#pendingNotes = plan.show;
    } else if (plan.show) {
      this.notes = plan.show;
    } else if (plan.remember) {
      settings.update((s) => (s.app.lastSeenVersion = current));
    }
  }

  showCurrent(): void {
    this.previousVersion = "";
    this.notes = notesFor(__APP_VERSION__);
  }

  showWelcome(): void {
    this.welcome = [...WELCOME_STEPS];
  }

  finishWelcome(): void {
    this.welcome = null;
    if (this.#pendingNotes) {
      this.notes = this.#pendingNotes;
      this.#pendingNotes = null;
    } else {
      settings.update((s) => (s.app.lastSeenVersion = __APP_VERSION__));
    }
  }

  dismiss(): void {
    this.notes = null;
    settings.update((s) => (s.app.lastSeenVersion = __APP_VERSION__));
  }
}

export const whatsNew = new WhatsNew();
