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

export type Appearance = "system" | "light" | "dark";
export type StartScreen = "library" | "last-document";
export type SidebarTab = "outline" | "bookmarks" | "notes";

export interface AppSettings {
  /** Light or dark interface (the reading theme for pages is separate). */
  appearance: Appearance;
  startScreen: StartScreen;
  /** Interface language. Only "en" exists today; the setting is here for future locales. */
  locale: string;
  checkForUpdates: boolean;
  /** The version whose "What's new" the user has seen; "" on a fresh install. */
  lastSeenVersion: string;
}

export interface TimerSettings {
  /** Minutes. */
  focus: number;
  shortBreak: number;
  longBreak: number;
  /** Focus sessions before a long break. */
  sessionsBeforeLong: number;
  sound: boolean;
}

export interface ReaderLayout {
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
}

export interface Settings {
  version: 1;
  app: AppSettings;
  reading: ReadingSettings;
  timer: TimerSettings;
  reader: ReaderLayout;
}

export const TIMER_LIMITS = { minMinutes: 1, maxMinutes: 180, step: 5, minSessions: 1, maxSessions: 12 } as const;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  app: { appearance: "system", startScreen: "library", locale: "en", checkForUpdates: true, lastSeenVersion: "" },
  timer: { focus: 50, shortBreak: 10, longBreak: 20, sessionsBeforeLong: 4, sound: true },
  reader: { sidebarOpen: true, sidebarTab: "outline" },
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

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseSettings(raw: unknown): Settings {
  const root = obj(raw);
  const app = obj(root.app);
  const timer = obj(root.timer);
  const reader = obj(root.reader);
  const da = DEFAULT_SETTINGS.app;
  const dt = DEFAULT_SETTINGS.timer;
  const { minMinutes: lo, maxMinutes: hi } = TIMER_LIMITS;
  const reading = obj(root.reading);
  const auto = obj(reading.auto);
  const d = DEFAULT_SETTINGS.reading;
  const theme = READING_THEMES.some((t) => t.id === reading.theme) ? (reading.theme as ThemeId) : d.theme;
  const mode = ["off", "system", "schedule"].includes(auto.mode as string) ? (auto.mode as AutoThemeMode) : d.auto.mode;
  return {
    version: 1,
    app: {
      appearance: oneOf(app.appearance, ["system", "light", "dark"], da.appearance),
      startScreen: oneOf(app.startScreen, ["library", "last-document"], da.startScreen),
      locale: typeof app.locale === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(app.locale) ? app.locale : da.locale,
      checkForUpdates: bool(app.checkForUpdates, da.checkForUpdates),
      lastSeenVersion: typeof app.lastSeenVersion === "string" && app.lastSeenVersion.length < 40 ? app.lastSeenVersion : da.lastSeenVersion,
    },
    timer: {
      focus: int(timer.focus, lo, hi, dt.focus),
      shortBreak: int(timer.shortBreak, lo, hi, dt.shortBreak),
      longBreak: int(timer.longBreak, lo, hi, dt.longBreak),
      sessionsBeforeLong: int(timer.sessionsBeforeLong, TIMER_LIMITS.minSessions, TIMER_LIMITS.maxSessions, dt.sessionsBeforeLong),
      sound: bool(timer.sound, dt.sound),
    },
    reader: {
      sidebarOpen: bool(reader.sidebarOpen, DEFAULT_SETTINGS.reader.sidebarOpen),
      sidebarTab: oneOf(reader.sidebarTab, ["outline", "bookmarks", "notes"], DEFAULT_SETTINGS.reader.sidebarTab),
    },
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
