/**
 * Version comparison for updates and "What's new". Handles x.y.z and prereleases such as
 * 2.1.0-beta.2 (a prerelease is older than its release).
 */
export interface Version {
  major: number;
  minor: number;
  patch: number;
  pre: Array<string | number>;
}

export function parseVersion(text: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(text.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [],
  };
}

/** Negative if a < b, 0 if equal, positive if a > b. Unparseable versions sort first. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return (va ? 1 : 0) - (vb ? 1 : 0);
  const core = va.major - vb.major || va.minor - vb.minor || va.patch - vb.patch;
  if (core) return core;
  if (!va.pre.length || !vb.pre.length) return vb.pre.length - va.pre.length;
  for (let i = 0; i < Math.max(va.pre.length, vb.pre.length); i++) {
    const x = va.pre[i];
    const y = vb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** "2.0.0-beta.1" → "2.0.0". */
export function releaseOf(version: string): string {
  const v = parseVersion(version);
  return v ? `${v.major}.${v.minor}.${v.patch}` : version;
}
