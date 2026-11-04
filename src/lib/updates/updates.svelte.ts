/**
 * Updates.
 *
 * New versions (and their notes) are found on the GitHub releases of hydese/LumiPDF, once when
 * the app starts (unless turned off) and on "Check now". The Update button only appears when a
 * newer release exists.
 *
 * Installed copies then use the signed updater (Rust, updater.rs):
 *  - "auto": downloads quietly and installs when LumiPDF closes (or on "Restart to update");
 *  - "ask": shows the update and downloads and installs it when you click.
 * The portable exe opens the release page instead.
 * The beta switch includes pre-releases.
 */
import { compareVersions, parseVersion } from "../app/semver";
import { settings } from "../settings/store.svelte";
import { updateCheck, updateDownload, updateInstall, updateInstallable } from "../ipc/updater";

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

/** The newest release newer than `current`; prereleases only with `beta` or if `current` is one. */
export function pickUpdate(releases: GitHubRelease[], current: string, beta = false): AvailableUpdate | null {
  const allowPre = beta || (parseVersion(current)?.pre.length ?? 0) > 0;
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
/** Installing in place: what the signed updater is doing. */
export type InstallStatus = "none" | "downloading" | "ready" | "installing" | "failed";

class Updates {
  readonly current = __APP_VERSION__;
  /** This build is a beta (pre-release). */
  readonly isBeta = (parseVersion(__APP_VERSION__)?.pre.length ?? 0) > 0;
  /** The beta switch is shown: unlocked by the hidden gesture, or already in use. */
  get betaVisible(): boolean {
    return settings.value.app.betaUnlocked || settings.value.app.betaUpdates || this.isBeta;
  }
  status = $state<UpdateStatus>("idle");
  available = $state<AvailableUpdate | null>(null);
  lastChecked = $state<Date | null>(null);
  /** This copy can install updates itself (not the portable exe). */
  installable = $state(false);
  /** The signed updater has this update for this channel. */
  signed = $state(false);
  install = $state<InstallStatus>("none");
  /** Download progress, 0…1 (null when the size isn't known). */
  progress = $state<number | null>(null);
  installError = $state<string | null>(null);
  /** Set by the app: saves annotations, study time and sheets before installing. */
  beforeInstall: () => Promise<unknown> = async () => {};

  async check(): Promise<void> {
    if (this.status === "checking") return;
    this.status = "checking";
    try {
      const response = await fetch(RELEASES_API, {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const beta = settings.value.app.betaUpdates;
      this.available = pickUpdate((await response.json()) as GitHubRelease[], this.current, beta);
      this.status = this.available ? "available" : "up-to-date";
      await this.#checkSigned(beta);
    } catch (err) {
      console.warn("LumiPDF: update check failed", err);
      this.status = "error";
    } finally {
      this.lastChecked = new Date();
    }
  }

  async #checkSigned(beta: boolean): Promise<void> {
    this.installable = await updateInstallable().catch(() => false);
    if (!this.installable || !this.available) {
      this.signed = false;
      return;
    }
    const meta = await updateCheck(beta).catch((err) => {
      console.warn("LumiPDF: signed update check failed", err);
      return null;
    });
    this.signed = meta !== null;
    if (this.signed && settings.value.app.updateMode === "auto" && this.install === "none") void this.download();
  }

  /** Downloads the update (signature checked). Automatic mode then waits for LumiPDF to close. */
  async download(): Promise<boolean> {
    if (!this.signed || this.install === "downloading" || this.install === "installing") return false;
    if (this.install === "ready") return true;
    this.install = "downloading";
    this.progress = 0;
    this.installError = null;
    try {
      await updateDownload((e) => {
        if (e.event === "progress") this.progress = e.total ? Math.min(1, e.downloaded / e.total) : null;
      });
      this.install = "ready";
      return true;
    } catch (err) {
      this.install = "failed";
      this.installError = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
      return false;
    }
  }

  /** Saves everything, then installs (downloading first if needed). LumiPDF closes or restarts. */
  async installNow(): Promise<void> {
    if (!(await this.download())) return;
    this.install = "installing";
    await this.beforeInstall();
    try {
      await updateInstall();
    } catch (err) {
      this.install = "failed";
      this.installError = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
    }
  }

  /**
   * Leaves the beta channel. On a beta build, looks for the stable version to go back to (even
   * if its number is lower) and returns it, so the caller can ask "switch now?". Null: there's
   * no stable version yet (or this copy can't install updates).
   */
  async leaveBeta(): Promise<{ version: string; installable: boolean } | null> {
    settings.update((s) => (s.app.betaUpdates = false));
    this.install = "none";
    if (!this.isBeta) {
      void this.check();
      return null;
    }
    this.installable = await updateInstallable().catch(() => false);
    if (!this.installable) {
      // Portable: the release page has the stable download, if there is one.
      await this.check();
      return this.available ? { version: this.available.version, installable: false } : null;
    }
    const meta = await updateCheck(false, true).catch(() => null);
    if (!meta) return null;
    this.signed = true;
    this.available = { version: meta.version, notes: meta.notes ?? "", url: RELEASES_PAGE, publishedAt: "" };
    this.status = "available";
    return { version: meta.version, installable: true };
  }

  /** Automatic mode: an update is downloaded and should be installed when LumiPDF closes. */
  get installOnQuit(): boolean {
    return settings.value.app.updateMode === "auto" && this.install === "ready";
  }

  /**
   * Installing a beta puts you on the beta channel (once: if you turn it off later, it stays
   * off), so testers get the next beta without looking for the hidden switch.
   */
  adoptBeta(): void {
    if (this.isBeta && !settings.value.app.betaUnlocked) {
      settings.update((s) => {
        s.app.betaUnlocked = true;
        s.app.betaUpdates = true;
      });
    }
  }

  /** Checks shortly after launch, so startup isn't slowed by the network. */
  checkSoon(): () => void {
    const timer = setTimeout(() => void this.check(), STARTUP_DELAY_MS);
    return () => clearTimeout(timer);
  }
}

export const updates = new Updates();
