/**
 * The app's settings, reactive and persisted. Change them with `settings.update(...)`; saving to
 * disk is debounced so dragging a slider doesn't write the file on every step.
 */
import { loadSettings, saveSettings } from "../ipc/settings";
import { announceSettingsSaved } from "../ipc/windows";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "./schema";

const SAVE_DELAY_MS = 400;

class SettingsStore {
  value = $state<Settings>(structuredClone(DEFAULT_SETTINGS));
  loaded = $state(false);
  #saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** `keep` copies what this window owns (its open tabs) from the current value into the loaded one. */
  async load(keep?: (loaded: Settings, current: Settings) => void): Promise<void> {
    try {
      const loaded = parseSettings(await loadSettings());
      if (keep) keep(loaded, $state.snapshot(this.value));
      this.value = loaded;
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
      saveSettings($state.snapshot(this.value))
        .then(announceSettingsSaved)
        .catch((err) => console.error("LumiPDF: could not save settings", err));
    }, SAVE_DELAY_MS);
  }
}

export const settings = new SettingsStore();
