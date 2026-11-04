/**
 * "What's new" after an update. The notes live in releases.json, edited with every release.
 */
import data from "./releases.json";
import { compareVersions, releaseOf } from "../app/semver";

export type ChangeTag = "new" | "better" | "fixed";
export type WelcomeStep = "language" | "usage" | "appearance" | "reading" | "library" | "updates";
export const WELCOME_STEPS: WelcomeStep[] = ["language", "usage", "appearance", "reading", "library", "updates"];

export interface ReleaseNotes {
  version: string;
  /** "YYYY-MM-DD", filled in when the version is released. */
  date: string;
  items: Array<{ tag: ChangeTag; title: string; text: string }>;
  /**
   * Optional: welcome steps to show again after updating to this version, when a change needs
   * the user to choose something (e.g. ["reading"] after adding themes).
   */
  welcome?: WelcomeStep[];
}

export const RELEASES = data.releases as ReleaseNotes[];

export function notesFor(version: string): ReleaseNotes | null {
  const release = releaseOf(version);
  return RELEASES.find((r) => r.version === release) ?? null;
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
  if (!lastSeen) return { welcome: [...WELCOME_STEPS], show: null, remember: false };
  if (compareVersions(current, lastSeen) <= 0) return { welcome: [], show: null, remember: false };
  const own = RELEASES.find((r) => r.version === current) ?? null;
  // Updating between prereleases of the same version doesn't repeat the notes, unless that
  // prerelease has an entry of its own.
  const notes = own ?? (releaseOf(current) === releaseOf(lastSeen) ? null : notesFor(current));
  const welcome = (notes?.welcome ?? []).filter((s) => WELCOME_STEPS.includes(s));
  return { welcome, show: notes, remember: notes === null };
}
