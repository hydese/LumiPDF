/**
 * Light or dark interface, from the "App appearance" setting or the system.
 */
import { settings } from "../settings/store.svelte";

class Appearance {
  #systemDark = $state(typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);

  readonly theme = $derived.by((): "light" | "dark" => {
    const choice = settings.value.app.appearance;
    if (choice === "system") return this.#systemDark ? "dark" : "light";
    return choice;
  });

  /** Keeps <html data-theme> in sync. Returns a cleanup function. */
  start(): () => void {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => (this.#systemDark = media.matches);
    media.addEventListener("change", onChange);
    const stop = $effect.root(() => {
      $effect(() => {
        document.documentElement.dataset.theme = this.theme;
      });
    });
    return () => {
      media.removeEventListener("change", onChange);
      stop();
    };
  }
}

export const appearance = new Appearance();
