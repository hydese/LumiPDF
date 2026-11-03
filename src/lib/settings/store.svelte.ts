/**
 * The app's settings, reactive and persisted. Change them with `settings.update(...)`; saving to
 * disk is debounced so dragging a slider doesn't write the file on every step.
 */
import { loadSettings, saveSettings } from "../ipc/settings";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "./schema";

const SAVE_DELAY_MS = 400;

class SettingsStore {
  value = $state<Settings>(structuredClone(DEFAULT_SETTINGS));
  loaded = $state(false);
  #saveTimer: ReturnType<typeof setTimeout> | null = null;

  async load(): Promise<void> {
    try {
      this.value = parseSettings(await loadSettings());
    } catch (err) {
      console.error("LumiPDF: could not load settings, using defaults", err);
    }
    this.loaded = true;
  }

  update(change: (s: Settings) => void): void {
    change(this.value);
    this.value = parseSettings($state.snapshot(this.value)); // re-validate after every change
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      saveSettings($state.snapshot(this.value)).catch((err) => console.error("LumiPDF: could not save settings", err));
    }, SAVE_DELAY_MS);
  }
}

export const settings = new SettingsStore();
