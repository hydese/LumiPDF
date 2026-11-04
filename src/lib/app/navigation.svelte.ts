/**
 * Which screen is showing. Three screens, no URLs: the Library (home), the Reader and Settings.
 */
export type Screen = "library" | "reader" | "settings";
export type SettingsSection = "general" | "appearance" | "reading" | "library" | "shortcuts" | "about";

class Navigation {
  screen = $state<Screen>("library");
  settingsSection = $state<SettingsSection>("general");
  #returnTo: Screen = "library";

  go(screen: Screen): void {
    if (screen === "settings" && this.screen !== "settings") this.#returnTo = this.screen;
    this.screen = screen;
  }

  openSettings(section: SettingsSection = "general"): void {
    this.settingsSection = section;
    this.go("settings");
  }

  /** Leaves Settings for the screen it was opened from. */
  closeSettings(): void {
    this.screen = this.#returnTo;
  }
}

export const navigation = new Navigation();
