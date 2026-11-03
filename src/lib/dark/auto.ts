/**
 * Auto theme: decides whether dark mode should be on right now.
 */
import type { ReadingSettings } from "../settings/schema";

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True if `now` falls in the dark period [from, until), which may wrap past midnight. */
export function inDarkPeriod(now: Date, darkFrom: string, darkUntil: string): boolean {
  const t = now.getHours() * 60 + now.getMinutes();
  const from = minutes(darkFrom);
  const until = minutes(darkUntil);
  if (from === until) return true;
  return from < until ? t >= from && t < until : t >= from || t < until;
}

/** What auto theme wants, or null when auto theme is off. */
export function autoDarkWanted(reading: ReadingSettings, now: Date, systemPrefersDark: boolean): boolean | null {
  switch (reading.auto.mode) {
    case "system":
      return systemPrefersDark;
    case "schedule":
      return inDarkPeriod(now, reading.auto.darkFrom, reading.auto.darkUntil);
    default:
      return null;
  }
}
