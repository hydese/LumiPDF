/**
 * What LumiPDF shows at launch: the welcome on a first install (or the welcome steps an update
 * asks for), then "What's new" once after an update. When the welcome has a "whatsnew" page, the
 * notes are shown there instead of in a dialog afterwards. The notes can be reopened from
 * Settings › About.
 */
import { settings } from "../settings/store.svelte";
import { notesFor, whatsNewOnLaunch, type ReleaseNotes, type WelcomeStep } from "./whatsnew";

class WhatsNew {
  notes = $state<ReleaseNotes | null>(null);
  previousVersion = $state("");
  welcome = $state<WelcomeStep[] | null>(null);
  /** The notes the welcome's "whatsnew" page shows. */
  welcomeNotes = $state<ReleaseNotes | null>(null);
  #pendingNotes: ReleaseNotes | null = null;

  /** Call after settings are loaded. */
  onLaunch(): void {
    const current = __APP_VERSION__;
    const lastSeen = settings.value.app.lastSeenVersion;
    const plan = whatsNewOnLaunch(current, lastSeen);
    this.previousVersion = lastSeen;
    if (plan.welcome.length) {
      const inWelcome = plan.welcome.includes("whatsnew") && plan.show !== null;
      this.welcome = inWelcome || !plan.welcome.includes("whatsnew") ? plan.welcome : plan.welcome.filter((s) => s !== "whatsnew");
      this.welcomeNotes = inWelcome ? plan.show : null;
      this.#pendingNotes = inWelcome ? null : plan.show;
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

  finishWelcome(): void {
    this.welcome = null;
    this.welcomeNotes = null;
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
