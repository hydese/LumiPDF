/**
 * Settings schema. Everything read from disk passes through `parseSettings`, so a damaged or
 * older settings file can never put the app in an invalid state.
 */
import { DEFAULT_TUNING, READING_THEMES, clampTuning, type DarkTuning, type ThemeId } from "../dark/themes";

export type AutoThemeMode = "off" | "system" | "schedule";

export interface ReadingSettings {
  /** Dark mode on/off when auto theme is off. */
  darkEnabled: boolean;
  /** Slightly bolder text and at least 1 px lines (low-resolution screens). */
  textClarity: boolean;
  theme: ThemeId;
  tuning: DarkTuning;
  auto: {
    mode: AutoThemeMode;
    /** "HH:MM", local time. Dark mode is on from `darkFrom` until `darkUntil` (may wrap midnight). */
    darkFrom: string;
    darkUntil: string;
  };
}

export type UpdateMode = "auto" | "ask";
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
  /** Installed copies: "auto" downloads updates quietly and installs them when LumiPDF closes;
   * "ask" shows them and waits for a click. */
  updateMode: UpdateMode;
  /** Get test versions (pre-releases) before everyone else. */
  betaUpdates: boolean;
  /** The beta switch was revealed (hidden gesture: click the version in About 7 times). */
  betaUnlocked: boolean;
  /** The version whose "What's new" the user has seen; "" on a fresh install. */
  lastSeenVersion: string;
}

export type TimerMode = "timer" | "pomodoro" | "alarm" | "chrono";

export interface TimerSettings {
  /** The tab the timer panel opens on. */
  mode: TimerMode;
  /** Timer (simple countdown) length, minutes. */
  countdown: number;
  /** Alarm time, "HH:MM" local (always stored 24-hour). */
  alarm: string;
  /** Show and set the alarm as 24-hour time (otherwise 12-hour with AM/PM). */
  clock24: boolean;
  /** Ask before closing LumiPDF while a timer, alarm or stopwatch is running. */
  askOnClose: boolean;
  /** Pomodoro lengths, minutes. */
  focus: number;
  shortBreak: number;
  longBreak: number;
  /** Focus sessions before a long break. */
  sessionsBeforeLong: number;
  sound: boolean;
}

export interface NotebookCard {
  /** Card title; "" uses the default ("GoodNotes notebooks"). */
  title: string;
  sort: "recent" | "name";
  /** How many notebooks the card shows. */
  count: number;
  view: "list" | "grid";
  /** Notebooks hidden from the card (paths). */
  hidden: string[];
}

export type FolderSort = "name" | "name-desc" | "recent";

export interface LibrarySettings {
  /** Order of folders and files in the folder browser. */
  sort: FolderSort;
  /** Show the GoodNotes notebooks card (next to the Formula sheets card). */
  goodnotes: boolean;
  notebooks: NotebookCard;
}

export interface ReaderLayout {
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  /** Paths of the open tabs, to reopen them next time. */
  openTabs: string[];
  activeTab: string;
  /** Show a preview when hovering a link inside the document. */
  linkPreviews: boolean;
}

export interface StudySettings {
  /** Daily study goal in minutes (0 = no goal). */
  goal: number;
  /** Study tools on (timers, stats, formula sheets); off gives a plain PDF reader. */
  tools: boolean;
  timer: boolean;
  stats: boolean;
  sheets: boolean;
  /** The "Studying? Turn on study tools" line in the Library was closed. */
  hintDismissed: boolean;
}

export type SheetPaper = "a4" | "letter";

export interface SheetSettings {
  /** The formula sheet snips go to by default (its id, "" = none yet). */
  last: string;
  /** Paper for new sheets. */
  paper: SheetPaper;
  /** The "switch to Free to place snips anywhere" tip was closed. */
  tipDismissed: boolean;
}

/** The annotation tools remember their last colour and size. */
export interface AnnotateSettings {
  inkColor: string;
  inkWidth: number;
  markerColor: string;
  markerWidth: number;
  markColor: string;
  markKind: "highlight" | "underline" | "strike";
  noteColor: string;
  /** Custom colours picked recently (hex), newest first. */
  recentColors: string[];
}

export interface Settings {
  version: 1;
  app: AppSettings;
  reading: ReadingSettings;
  timer: TimerSettings;
  reader: ReaderLayout;
  library: LibrarySettings;
  annotate: AnnotateSettings;
  study: StudySettings;
  sheets: SheetSettings;
}

/** US Letter where it's the norm (US, Canada, Mexico, Philippines…), A4 elsewhere. */
export function systemPaper(): SheetPaper {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region ?? "";
    return ["US", "CA", "MX", "PH", "CL", "CO", "VE", "GT", "PR"].includes(region) ? "letter" : "a4";
  } catch {
    return "a4";
  }
}

export const STUDY_GOAL_LIMITS = { min: 0, max: 16 * 60 } as const;

/** The system clock format: 24-hour unless the locale uses AM/PM. */
export function systemUses24h(): boolean {
  try {
    const cycle = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
    return cycle === "h23" || cycle === "h24";
  } catch {
    return true;
  }
}

export const TIMER_LIMITS = { minMinutes: 1, maxMinutes: 180, step: 1, minSessions: 1, maxSessions: 12 } as const;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  app: { appearance: "system", startScreen: "library", locale: "en", checkForUpdates: true, updateMode: "ask", betaUpdates: false, betaUnlocked: false, lastSeenVersion: "" },
  timer: { mode: "timer", countdown: 25, alarm: "07:30", clock24: systemUses24h(), askOnClose: true, focus: 50, shortBreak: 10, longBreak: 20, sessionsBeforeLong: 4, sound: true },
  reader: { sidebarOpen: true, sidebarTab: "outline", openTabs: [], activeTab: "", linkPreviews: true },
  study: { goal: 120, tools: true, timer: true, stats: true, sheets: true, hintDismissed: false },
  sheets: { last: "", paper: systemPaper(), tipDismissed: false },
  annotate: { inkColor: "#2f5bd8", inkWidth: 1.8, markerColor: "#ffe14d", markerWidth: 13, markColor: "#ffe14d", markKind: "highlight", noteColor: "#ffd84d", recentColors: [] },
  library: { sort: "name", goodnotes: false, notebooks: { title: "", sort: "recent", count: 5, view: "list", hidden: [] } },
  reading: {
    darkEnabled: true,
    textClarity: false,
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
  const lib = obj(root.library);
  const nb = obj(lib.notebooks);
  const dnb = DEFAULT_SETTINGS.library.notebooks;
  const an = obj(root.annotate);
  const dan = DEFAULT_SETTINGS.annotate;
  const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
  const width = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
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
      updateMode: oneOf(app.updateMode, ["auto", "ask"], da.updateMode),
      betaUpdates: bool(app.betaUpdates, da.betaUpdates),
      betaUnlocked: bool(app.betaUnlocked, da.betaUnlocked),
      lastSeenVersion: typeof app.lastSeenVersion === "string" && app.lastSeenVersion.length < 40 ? app.lastSeenVersion : da.lastSeenVersion,
    },
    timer: {
      mode: oneOf(timer.mode, ["timer", "pomodoro", "alarm", "chrono"], dt.mode),
      countdown: int(timer.countdown, lo, hi, dt.countdown),
      alarm: typeof timer.alarm === "string" && TIME.test(timer.alarm) ? timer.alarm : dt.alarm,
      clock24: bool(timer.clock24, dt.clock24),
      askOnClose: bool(timer.askOnClose, dt.askOnClose),
      focus: int(timer.focus, lo, hi, dt.focus),
      shortBreak: int(timer.shortBreak, lo, hi, dt.shortBreak),
      longBreak: int(timer.longBreak, lo, hi, dt.longBreak),
      sessionsBeforeLong: int(timer.sessionsBeforeLong, TIMER_LIMITS.minSessions, TIMER_LIMITS.maxSessions, dt.sessionsBeforeLong),
      sound: bool(timer.sound, dt.sound),
    },
    reader: {
      sidebarOpen: bool(reader.sidebarOpen, DEFAULT_SETTINGS.reader.sidebarOpen),
      sidebarTab: oneOf(reader.sidebarTab, ["outline", "bookmarks", "notes"], DEFAULT_SETTINGS.reader.sidebarTab),
      openTabs: Array.isArray(reader.openTabs) ? reader.openTabs.filter((p): p is string => typeof p === "string").slice(0, 30) : [],
      activeTab: typeof reader.activeTab === "string" ? reader.activeTab : "",
      linkPreviews: bool(reader.linkPreviews, DEFAULT_SETTINGS.reader.linkPreviews),
    },
    study: {
      goal: int(obj(root.study).goal, STUDY_GOAL_LIMITS.min, STUDY_GOAL_LIMITS.max, DEFAULT_SETTINGS.study.goal),
      tools: bool(obj(root.study).tools, true),
      timer: bool(obj(root.study).timer, true),
      stats: bool(obj(root.study).stats, true),
      sheets: bool(obj(root.study).sheets, true),
      hintDismissed: bool(obj(root.study).hintDismissed, false),
    },
    sheets: {
      last: typeof obj(root.sheets).last === "string" && /^[a-z0-9-]{0,40}$/.test(obj(root.sheets).last as string) ? (obj(root.sheets).last as string) : "",
      paper: oneOf(obj(root.sheets).paper, ["a4", "letter"], DEFAULT_SETTINGS.sheets.paper),
      tipDismissed: bool(obj(root.sheets).tipDismissed, false),
    },
    annotate: {
      inkColor: hex(an.inkColor, dan.inkColor),
      inkWidth: width(an.inkWidth, 0.5, 10, dan.inkWidth),
      markerColor: hex(an.markerColor, dan.markerColor),
      markerWidth: width(an.markerWidth, 4, 40, dan.markerWidth),
      markColor: hex(an.markColor, dan.markColor),
      markKind: oneOf(an.markKind, ["highlight", "underline", "strike"], dan.markKind),
      noteColor: hex(an.noteColor, dan.noteColor),
      recentColors: Array.isArray(an.recentColors) ? an.recentColors.filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)).slice(0, 8) : [],
    },
    library: {
      sort: oneOf(lib.sort, ["name", "name-desc", "recent"], DEFAULT_SETTINGS.library.sort),
      goodnotes: bool(lib.goodnotes, DEFAULT_SETTINGS.library.goodnotes),
      notebooks: {
        title: typeof nb.title === "string" ? nb.title.slice(0, 60) : dnb.title,
        sort: oneOf(nb.sort, ["recent", "name"], dnb.sort),
        count: int(nb.count, 1, 24, dnb.count),
        view: oneOf(nb.view, ["list", "grid"], dnb.view),
        hidden: Array.isArray(nb.hidden) ? nb.hidden.filter((p): p is string => typeof p === "string").slice(0, 500) : [],
      },
    },
    reading: {
      darkEnabled: typeof reading.darkEnabled === "boolean" ? reading.darkEnabled : d.darkEnabled,
      textClarity: bool(reading.textClarity, d.textClarity),
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
