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
