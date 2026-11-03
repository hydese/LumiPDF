/**
 * Settings schema. Everything read from disk passes through `parseSettings`, so a damaged or
 * older settings file can never put the app in an invalid state.
 */
import { DEFAULT_TUNING, READING_THEMES, clampTuning, type DarkTuning, type ThemeId } from "../dark/themes";

export type AutoThemeMode = "off" | "system" | "schedule";

export interface ReadingSettings {
  /** Dark mode on/off when auto theme is off. */
  darkEnabled: boolean;
  theme: ThemeId;
  tuning: DarkTuning;
  auto: {
    mode: AutoThemeMode;
    /** "HH:MM", local time. Dark mode is on from `darkFrom` until `darkUntil` (may wrap midnight). */
    darkFrom: string;
    darkUntil: string;
  };
}

export interface Settings {
  version: 1;
  reading: ReadingSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  reading: {
    darkEnabled: true,
    theme: "lumina-black",
    tuning: DEFAULT_TUNING,
    auto: { mode: "off", darkFrom: "19:00", darkUntil: "07:00" },
  },
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function parseSettings(raw: unknown): Settings {
  const reading = obj(obj(raw).reading);
  const auto = obj(reading.auto);
  const d = DEFAULT_SETTINGS.reading;
  const theme = READING_THEMES.some((t) => t.id === reading.theme) ? (reading.theme as ThemeId) : d.theme;
  const mode = ["off", "system", "schedule"].includes(auto.mode as string) ? (auto.mode as AutoThemeMode) : d.auto.mode;
  return {
    version: 1,
    reading: {
      darkEnabled: typeof reading.darkEnabled === "boolean" ? reading.darkEnabled : d.darkEnabled,
      theme,
      tuning: clampTuning(obj(reading.tuning) as Partial<DarkTuning>),
      auto: {
        mode,
        darkFrom: typeof auto.darkFrom === "string" && TIME.test(auto.darkFrom) ? auto.darkFrom : d.auto.darkFrom,
        darkUntil: typeof auto.darkUntil === "string" && TIME.test(auto.darkUntil) ? auto.darkUntil : d.auto.darkUntil,
      },
    },
  };
}
