/**
 * The macOS menu bar (see src-tauri/src/menu.rs). The menu's labels are sent in the user's
 * language; its LumiPDF items come back as "menu" events with the item's id.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { t } from "../i18n";

export type MenuAction =
  | "settings"
  | "quit"
  | "open"
  | "close-tab"
  | "export"
  | "undo"
  | "redo"
  | "find"
  | "fullscreen"
  | "github";

const LABELS = [
  "about", "settings", "services", "hide", "hideOthers", "showAll", "quit", "file", "open", "closeTab", "export",
  "edit", "undo", "redo", "cut", "copy", "paste", "selectAll", "find", "view", "fullscreen", "window", "minimize",
  "zoom", "help", "github",
] as const;

/** Rebuilds the menu in the current language (macOS only; the backend ignores it elsewhere). */
export function setMenuLanguage(): Promise<void> {
  const labels = Object.fromEntries(LABELS.map((k) => [k, t(`menu.${k}`)]));
  return invoke<void>("set_menu", { labels });
}

export function onMenu(handler: (action: MenuAction) => void): Promise<UnlistenFn> {
  return listen<string>("menu", (event) => handler(event.payload as MenuAction));
}
