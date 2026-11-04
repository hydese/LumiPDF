/**
 * Keyboard shortcut helpers. The primary modifier is Ctrl on Windows/Linux and Cmd on macOS;
 * all shortcut handling goes through here so the macOS build needs no changes elsewhere.
 */
export type Platform = "windows" | "macos" | "linux";

export function detectPlatform(userAgent: string): Platform {
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macos";
  if (/Windows/i.test(userAgent)) return "windows";
  return "linux";
}

export interface KeyLike {
  ctrlKey: boolean;
  metaKey: boolean;
}

/** True when the platform's primary modifier (Ctrl, or Cmd on macOS) is held. */
export function isPrimaryModifier(event: KeyLike, platform: Platform): boolean {
  return platform === "macos" ? event.metaKey : event.ctrlKey;
}

/** Formats a shortcut such as `mod+shift+d` for display: "Ctrl+Shift+D" or "⌘⇧D". */
export function formatShortcut(shortcut: string, platform: Platform): string {
  const parts = shortcut.split("+").map((p) => p.trim().toLowerCase());
  if (platform === "macos") {
    const mac: Record<string, string> = { mod: "⌘", shift: "⇧", alt: "⌥", ctrl: "⌃" };
    return parts.map((p) => mac[p] ?? p.toUpperCase()).join("");
  }
  const win: Record<string, string> = { mod: "Ctrl", shift: "Shift", alt: "Alt", ctrl: "Ctrl" };
  return parts.map((p) => win[p] ?? p.toUpperCase()).join("+");
}

/**
 * Shortcuts that differ by platform. On macOS ⌘Tab switches apps and F11 shows the desktop, so
 * tabs use ⌃Tab (as in Safari) and full screen uses ⌃⌘F (the system's own).
 */
export function platformShortcut(name: "nextTab" | "prevTab" | "fullscreen", platform: Platform): string {
  const mac = platform === "macos";
  switch (name) {
    case "nextTab":
      return mac ? "ctrl+tab" : "mod+tab";
    case "prevTab":
      return mac ? "ctrl+shift+tab" : "mod+shift+tab";
    case "fullscreen":
      return mac ? "ctrl+mod+f" : "f11";
  }
}

/** True for the full-screen shortcut: F11, or ⌃⌘F on macOS. */
export function isFullscreenKey(event: KeyLike & { key: string }, platform: Platform): boolean {
  if (event.key === "F11") return true;
  return platform === "macos" && event.ctrlKey && event.metaKey && event.key.toLowerCase() === "f";
}

/** True for tab switching: Ctrl+Tab everywhere (⌘Tab is taken by macOS). */
export function isTabCycleKey(event: KeyLike & { key: string }, platform: Platform): boolean {
  return event.key === "Tab" && (event.ctrlKey || (platform !== "macos" && isPrimaryModifier(event, platform)));
}
