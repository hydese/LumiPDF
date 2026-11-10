/**
 * Several LumiPDF windows (windows.rs), all independent; the primary one is in
 * app/windowRole.svelte.ts. Events between windows are addressed to one window, so each window
 * listens only to its own.
 */
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

function currentLabel(): string {
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    return "main"; // preview in a browser
  }
}

export const windowLabel = currentLabel();
/** The first window of a start ("main"): the one that reopens last time's tabs. */
export const isFirstWindow = windowLabel === "main";

/** A tab moved to another window. */
export interface MovedTab {
  path: string;
  name: string;
  page: number;
  offset: number;
  password: string | null;
}

export const openWindow = (tab?: MovedTab) => invoke<string>("window_open", { tab: tab ? JSON.stringify(tab) : null });
export const takeMovedTab = () =>
  invoke<string | null>("window_take_tab")
    .then((json) => (json ? (JSON.parse(json) as MovedTab) : null))
    .catch(() => null);
/** Claims a PDF for this window; returns the label of another window that already has it. */
export const claimDoc = (path: string) => invoke<string | null>("window_claim_doc", { path }).catch(() => null);
export const releaseDoc = (path: string) => invoke<void>("window_release_doc", { path }).catch(() => {});
export const listWindows = () => invoke<Array<{ label: string; title: string }>>("window_list").catch(() => []);
export const sendTab = (label: string, tab: MovedTab) => invoke<void>("window_send", { label, event: "window-tab", payload: JSON.stringify(tab) });
export const showDocIn = (label: string, path: string) => invoke<void>("window_send", { label, event: "window-show-doc", payload: path });

/** Listens to an event addressed to this window only. */
export function onWindowEvent<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  try {
    return getCurrentWebviewWindow().listen<T>(event, (e) => handler(e.payload));
  } catch {
    return Promise.resolve(() => {});
  }
}

/** Settings were saved by one window: the others reload them. */
export function announceSettingsSaved(): void {
  void emit("settings-saved", windowLabel).catch(() => {});
}
export function onSettingsSavedElsewhere(handler: () => void): Promise<UnlistenFn> {
  return listen<string>("settings-saved", (e) => e.payload !== windowLabel && handler()).catch(() => () => {});
}
