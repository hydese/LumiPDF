/**
 * Reading themes. A theme is a background and a text colour; everything else on the page is
 * mapped between them by the dark engine. The user picks one theme in Settings; the dark mode
 * button turns it on and off.
 */

export type ThemeId = "lumina-black" | "oled-black" | "night-paper" | "deep-slate" | "soft-contrast";

export interface ReadingTheme {
  id: ThemeId;
  /** Page background (what white paper becomes). */
  background: string;
  /** Text colour (what black ink becomes). */
  text: string;
}

export const READING_THEMES: readonly ReadingTheme[] = [
  { id: "lumina-black", background: "#121214", text: "#e8e8e6" },
  { id: "oled-black", background: "#000000", text: "#d6d6d4" },
  { id: "night-paper", background: "#1c1812", text: "#e8dcc4" },
  { id: "deep-slate", background: "#0f141c", text: "#e3e9f2" },
  { id: "soft-contrast", background: "#1c1c1e", text: "#bdbdb9" },
];

export function getTheme(id: ThemeId): ReadingTheme {
  return READING_THEMES.find((t) => t.id === id) ?? READING_THEMES[0]!;
}

/** User adjustments applied on top of the chosen theme. */
export interface DarkTuning {
  /** Text brightness, 0.7 .. 1.15 (1 = theme default). */
  brightness: number;
  /** Mid-tone contrast, 0.7 .. 1.4 (1 = default). Higher makes grey text and lines stand out more. */
  contrast: number;
  /** Extra text weight in screen pixels, 0 .. 0.6. Light text on dark looks thinner; this compensates. */
  textWeight: number;
  /** Dim photos slightly so they don't glare against the dark page. */
  dimPhotos: boolean;
}

export const DEFAULT_TUNING: DarkTuning = {
  brightness: 1,
  contrast: 1,
  textWeight: 0.25,
  dimPhotos: true,
};

export function clampTuning(t: Partial<DarkTuning>): DarkTuning {
  const n = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  return {
    brightness: n(t.brightness, 0.7, 1.15, DEFAULT_TUNING.brightness),
    contrast: n(t.contrast, 0.7, 1.4, DEFAULT_TUNING.contrast),
    textWeight: n(t.textWeight, 0, 0.6, DEFAULT_TUNING.textWeight),
    dimPhotos: typeof t.dimPhotos === "boolean" ? t.dimPhotos : DEFAULT_TUNING.dimPhotos,
  };
}
