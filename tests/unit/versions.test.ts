import { describe, expect, it } from "vitest";
import pkg from "../../package.json" with { type: "json" };
import { compareVersions, releaseOf } from "../../src/lib/app/semver";
import { RELEASES, notesFor, whatsNewOnLaunch } from "../../src/lib/whatsnew/whatsnew";
import { dayKey, studyStreak, weekTotal } from "../../src/lib/app/dates";

describe("versions", () => {
  it("orders releases and prereleases", () => {
    expect(compareVersions("2.0.1", "2.0.0")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "2.0.0-beta.3")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0-beta.10", "2.0.0-beta.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0-alpha.0", "2.0.0-beta.0")).toBeLessThan(0);
    expect(compareVersions("v2.1.0", "2.1.0")).toBe(0);
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(releaseOf("2.1.0-beta.2")).toBe("2.1.0");
  });
});

describe("what's new", () => {
  it("has notes for the version in package.json", () => {
    // Update src/lib/whatsnew/releases.json before releasing a new version.
    expect(notesFor(pkg.version), `releases.json has no entry for ${releaseOf(pkg.version)}`).not.toBeNull();
  });

  it("lists releases newest first with valid tags", () => {
    const versions = RELEASES.map((r) => r.version);
    expect([...versions].sort((a, b) => compareVersions(b, a))).toEqual(versions);
    for (const r of RELEASES) {
      expect(r.items.length).toBeGreaterThan(0);
      for (const item of r.items) expect(["new", "better", "fixed"]).toContain(item.tag);
    }
  });

  it("shows the welcome on a fresh install, notes once after an update", () => {
    const all = ["language", "usage", "appearance", "reading", "library", "updates"];
    // 2.0.0 asks for the whole welcome plus its "what's new" page: new users get the tour too.
    const fresh = whatsNewOnLaunch("2.0.0", "");
    expect(fresh.welcome).toEqual([...all, "whatsnew"]);
    expect(fresh.show?.version).toBe("2.0.0");
    expect(whatsNewOnLaunch("2.0.0", "2.0.0").show).toBeNull();
    // From 1.x or a beta: the same welcome, with the 2.0.0 notes on its last page.
    for (const from of ["1.0.5", "2.0.0-beta.2"]) {
      const plan = whatsNewOnLaunch("2.0.0", from);
      expect(plan.show?.version).toBe("2.0.0");
      expect(plan.welcome).toEqual([...all, "whatsnew"]);
    }
    expect(whatsNewOnLaunch("2.0.0-beta.9", "2.0.0-beta.8")).toEqual({ welcome: [], show: null, remember: true });
    // A prerelease with its own entry shows its notes and the welcome steps it asks for.
    const beta2 = whatsNewOnLaunch("2.0.0-beta.2", "2.0.0-beta.1");
    expect(beta2.show?.version).toBe("2.0.0-beta.2");
    expect(beta2.welcome).toEqual(all);
    // A later version without welcome steps only shows its notes.
    expect(whatsNewOnLaunch("2.0.1", "2.0.0").welcome).toEqual([]);
  });
});

describe("study days", () => {
  const today = new Date(2026, 10, 4, 15);
  it("counts the streak ending today or yesterday", () => {
    expect(dayKey(today)).toBe("2026-11-04");
    expect(studyStreak({ "2026-11-04": 600, "2026-11-03": 600, "2026-11-01": 600 }, today)).toBe(2);
    expect(studyStreak({ "2026-11-03": 600, "2026-11-02": 600 }, today)).toBe(2);
    expect(studyStreak({ "2026-11-04": 10 }, today)).toBe(0);
    expect(weekTotal({ "2026-11-04": 60, "2026-10-29": 60, "2026-10-28": 60 }, today)).toBe(120);
  });
});

import { pickUpdate } from "../../src/lib/updates/updates.svelte";

describe("update check", () => {
  const rel = (tag: string, extra: Partial<{ draft: boolean; prerelease: boolean }> = {}) => ({
    tag_name: tag,
    body: `notes ${tag}`,
    html_url: `https://github.com/hydese/LumiPDF/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    published_at: "2026-11-10T10:00:00Z",
    ...extra,
  });

  it("finds the newest stable release", () => {
    const list = [rel("v2.0.1"), rel("v2.0.2"), rel("v2.1.0-beta.1", { prerelease: true }), rel("v3.0.0", { draft: true })];
    expect(pickUpdate(list, "2.0.0")?.version).toBe("2.0.2");
    expect(pickUpdate(list, "2.0.2")).toBeNull();
  });

  it("offers prereleases only to prerelease builds", () => {
    const list = [rel("v2.0.0-beta.2", { prerelease: true }), rel("v1.0.5")];
    expect(pickUpdate(list, "2.0.0-beta.1")?.version).toBe("2.0.0-beta.2");
    expect(pickUpdate(list, "2.0.0")).toBeNull();
  });

  it("offers prereleases on the beta channel", () => {
    const list = [rel("v2.0.1"), rel("v2.1.0-beta.1", { prerelease: true })];
    expect(pickUpdate(list, "2.0.0", true)?.version).toBe("2.1.0-beta.1");
    expect(pickUpdate(list, "2.0.0", false)?.version).toBe("2.0.1");
  });
});
