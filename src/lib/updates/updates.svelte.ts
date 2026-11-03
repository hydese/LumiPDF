/**
 * Update checks against the GitHub releases of hydese/LumiPDF.
 *
 * Checked once when the app starts (unless turned off) and when the user clicks "Check now".
 * The Update button only appears when a newer release exists. Installing in place arrives with
 * the signed updater; until then "Download" opens the release page.
 */
import { compareVersions, parseVersion } from "../app/semver";

const RELEASES_API = "https://api.github.com/repos/hydese/LumiPDF/releases?per_page=15";
export const RELEASES_PAGE = "https://github.com/hydese/LumiPDF/releases";
const STARTUP_DELAY_MS = 3000;
const TIMEOUT_MS = 10_000;

export interface AvailableUpdate {
  version: string;
  notes: string;
  url: string;
  publishedAt: string;
}

interface GitHubRelease {
  tag_name: string;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
}

/** The newest release newer than `current`; prereleases only if `current` is one. */
export function pickUpdate(releases: GitHubRelease[], current: string): AvailableUpdate | null {
  const allowPre = (parseVersion(current)?.pre.length ?? 0) > 0;
  let best: GitHubRelease | null = null;
  for (const r of releases) {
    if (r.draft || (r.prerelease && !allowPre) || !parseVersion(r.tag_name)) continue;
    if (compareVersions(r.tag_name, current) <= 0) continue;
    if (!best || compareVersions(r.tag_name, best.tag_name) > 0) best = r;
  }
  return best
    ? { version: best.tag_name.replace(/^v/, ""), notes: best.body ?? "", url: best.html_url, publishedAt: best.published_at ?? "" }
    : null;
}

export type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "error";

class Updates {
  readonly current = __APP_VERSION__;
  status = $state<UpdateStatus>("idle");
  available = $state<AvailableUpdate | null>(null);
  lastChecked = $state<Date | null>(null);

  async check(): Promise<void> {
    if (this.status === "checking") return;
    this.status = "checking";
    try {
      const response = await fetch(RELEASES_API, {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      this.available = pickUpdate((await response.json()) as GitHubRelease[], this.current);
      this.status = this.available ? "available" : "up-to-date";
    } catch (err) {
      console.warn("LumiPDF: update check failed", err);
      this.status = "error";
    } finally {
      this.lastChecked = new Date();
    }
  }

  /** Checks shortly after launch, so startup isn't slowed by the network. */
  checkSoon(): () => void {
    const timer = setTimeout(() => void this.check(), STARTUP_DELAY_MS);
    return () => clearTimeout(timer);
  }
}

export const updates = new Updates();
