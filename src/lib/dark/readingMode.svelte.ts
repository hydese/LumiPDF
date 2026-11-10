/**
 * Decides whether pages are shown dark and tells the dark engine.
 *
 * Without auto theme, the dark button turns dark mode on and off (and the choice is saved).
 * With auto theme on, the button overrides it until the next automatic switch, like on macOS.
 */
import { settings } from "../settings/store.svelte";
import { autoDarkWanted } from "./auto";
import { setTextClarity, setDarkMode } from "./engine";

const RECHECK_MS = 30_000;

class ReadingMode {
  /** Manual override while auto theme is on; cleared when auto theme next changes its mind. */
  #override = $state<boolean | null>(null);
  #systemDark = $state(false);
  #now = $state(new Date());
  #lastAuto: boolean | null = null;

  readonly autoWanted = $derived(autoDarkWanted(settings.value.reading, this.#now, this.#systemDark));
  readonly isDark = $derived(this.autoWanted === null ? settings.value.reading.darkEnabled : (this.#override ?? this.autoWanted));
  /** "Original page": while on, pages are drawn in their own colours (button or holding O). */
  original = $state(false);

  /** Starts watching the clock and the system theme. Returns a cleanup function. */
  start(): () => void {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    this.#systemDark = media.matches;
    const onMedia = () => (this.#systemDark = media.matches);
    media.addEventListener("change", onMedia);
    const timer = setInterval(() => (this.#now = new Date()), RECHECK_MS);

    const stopEffects = $effect.root(() => {
      $effect(() => {
        const auto = this.autoWanted;
        if (auto !== this.#lastAuto) {
          this.#override = null; // auto theme switched: a manual override ends here
          this.#lastAuto = auto;
        }
      });
      $effect(() => {
        const { theme, tuning } = settings.value.reading;
        setDarkMode(this.isDark && !this.original ? { theme, tuning: $state.snapshot(tuning) } : null, this.original);
      });
      $effect(() => setTextClarity(settings.value.reading.textClarity));
    });

    return () => {
      media.removeEventListener("change", onMedia);
      clearInterval(timer);
      stopEffects();
    };
  }

  toggle(): void {
    if (this.autoWanted === null) {
      settings.update((s) => (s.reading.darkEnabled = !s.reading.darkEnabled));
    } else {
      this.#override = !this.isDark;
    }
  }
}

export const readingMode = new ReadingMode();
