/**
 * "What's new" after an update. The notes live in releases.json, edited with every release.
 */
import data from "./releases.json";
import { compareVersions, releaseOf } from "../app/semver";

export type ChangeTag = "new" | "better" | "fixed";
/** "whatsnew" is the last page of a welcome: the release's notes, as a scrolling list. */
export type WelcomeStep = "language" | "usage" | "appearance" | "reading" | "library" | "updates" | "whatsnew";
/** The welcome of a fresh install. */
export const WELCOME_STEPS: WelcomeStep[] = ["language", "usage", "appearance", "reading", "library", "updates"];
const ALL_STEPS: WelcomeStep[] = [...WELCOME_STEPS, "whatsnew"];

export interface NoteItem {
  tag: ChangeTag;
  /** English; also used for the GitHub release notes. */
  title: string;
  text: string;
  /** Translations by locale code ("it", "pt-BR"…); missing ones fall back to English. */
  tr?: Record<string, { title: string; text: string }>;
}

export interface ReleaseNotes {
  version: string;
  /** Optional GitHub release title (default "LumiPDF <version>"). */
  title?: string;
  /** "YYYY-MM-DD", filled in when the version is released. */
  date: string;
  items: NoteItem[];
  /**
   * Optional: welcome steps to show again after updating to this version, when a change needs
   * the user to choose something (e.g. ["reading"] after adding themes).
   */
  welcome?: WelcomeStep[];
}

export const RELEASES = data.releases as ReleaseNotes[];

/** An item's title and text in `locale`, or in English. */
export function localized(item: NoteItem, locale: string): { title: string; text: string } {
  return item.tr?.[locale] ?? item.tr?.[locale.split("-")[0]!] ?? { title: item.title, text: item.text };
}

/** The notes for `version`: its own entry (a beta can have one), else its release's. */
export function notesFor(version: string): ReleaseNotes | null {
  const release = releaseOf(version);
  return RELEASES.find((r) => r.version === version) ?? RELEASES.find((r) => r.version === release) ?? null;
}

/**
 * What to do at startup: show the notes (the app was updated), or only remember the version
 * (fresh install, or nothing new to show).
 */
export interface LaunchPlan {
  /** Welcome steps to show first: all of them on a fresh install, or the ones an update asks for. */
  welcome: WelcomeStep[];
  /** Release notes to show (after the welcome, if any). */
  show: ReleaseNotes | null;
  /** Record the current version as seen now (nothing will be shown that needs dismissing). */
  remember: boolean;
}

/**
 * To show the welcome again after an update, give that version an entry in releases.json with
 * "welcome": the steps to show (all of them: ["language", "usage", "appearance", "reading",
 * "library", "updates"]). A beta can have its own entry ("2.1.0-beta.2"); otherwise betas share
 * the entry of the version they lead up to.
 */
export function whatsNewOnLaunch(current: string, lastSeen: string): LaunchPlan {
  if (!lastSeen) {
    // A fresh install sees the release's notes too when they are part of its welcome.
    const own = RELEASES.find((r) => r.version === current);
    const tour = own?.welcome?.includes("whatsnew") ? (["whatsnew"] as WelcomeStep[]) : [];
    return { welcome: [...WELCOME_STEPS, ...tour], show: tour.length ? own! : null, remember: false };
  }
  if (compareVersions(current, lastSeen) <= 0) return { welcome: [], show: null, remember: false };
  const own = RELEASES.find((r) => r.version === current) ?? null;
  // Updating between prereleases of the same version doesn't repeat the notes, unless that
  // prerelease has an entry of its own.
  const notes = own ?? (releaseOf(current) === releaseOf(lastSeen) ? null : notesFor(current));
  const welcome = (notes?.welcome ?? []).filter((s) => ALL_STEPS.includes(s));
  return { welcome, show: notes, remember: notes === null };
}
