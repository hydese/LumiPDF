/**
 * "What's new" after an update. The notes live in releases.json, edited with every release.
 */
import data from "./releases.json";
import { compareVersions, releaseOf } from "../app/semver";

export type ChangeTag = "new" | "better" | "fixed";

export interface ReleaseNotes {
  version: string;
  /** "YYYY-MM-DD", filled in when the version is released. */
  date: string;
  items: Array<{ tag: ChangeTag; title: string; text: string }>;
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
export function whatsNewOnLaunch(current: string, lastSeen: string): { show: ReleaseNotes | null; remember: boolean } {
  if (!lastSeen) return { show: null, remember: true };
  if (compareVersions(current, lastSeen) <= 0) return { show: null, remember: false };
  // Updating between prereleases of the same version doesn't repeat the notes.
  const notes = releaseOf(current) === releaseOf(lastSeen) ? null : notesFor(current);
  return { show: notes, remember: notes === null };
}
