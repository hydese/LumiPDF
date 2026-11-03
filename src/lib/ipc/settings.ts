import { invoke } from "@tauri-apps/api/core";

/** Raw settings document from disk; validate with parseSettings before use. */
export function loadSettings(): Promise<unknown> {
  return invoke<unknown>("load_settings");
}

export function saveSettings(settings: unknown): Promise<void> {
  return invoke<void>("save_settings", { settings });
}
