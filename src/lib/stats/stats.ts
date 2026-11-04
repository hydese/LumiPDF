/**
 * Study statistics from the library's per-day totals. Pure functions, tested in
 * tests/unit/stats.test.ts.
 */
import { dayKey } from "../app/dates";

export interface DayTotal {
  day: string;
  date: Date;
  seconds: number;
}

/** A day counts towards a streak with at least this much study. */
export const STREAK_MIN_SECONDS = 60;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The last `count` days ending today, oldest first. */
export function lastDays(days: Record<string, number>, today: Date, count: number): DayTotal[] {
  const out: DayTotal[] = [];
  const day = startOfDay(today);
  day.setDate(day.getDate() - (count - 1));
  for (let i = 0; i < count; i++) {
    const key = dayKey(day);
    out.push({ day: key, date: new Date(day), seconds: days[key] ?? 0 });
    day.setDate(day.getDate() + 1);
  }
  return out;
}

/** Sum of the last `count` days ending today. */
export function rangeTotal(days: Record<string, number>, today: Date, count: number): number {
  return lastDays(days, today, count).reduce((sum, d) => sum + d.seconds, 0);
}

export function allTime(days: Record<string, number>): number {
  return Object.values(days).reduce((sum, s) => sum + s, 0);
}

/** Days in a row with some study, ending today (or yesterday, if today has none yet). */
export function currentStreak(days: Record<string, number>, today: Date): number {
  const day = startOfDay(today);
  if ((days[dayKey(day)] ?? 0) < STREAK_MIN_SECONDS) day.setDate(day.getDate() - 1);
  let streak = 0;
  while ((days[dayKey(day)] ?? 0) >= STREAK_MIN_SECONDS) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

/** The longest run of study days ever recorded. */
export function bestStreak(days: Record<string, number>): number {
  const studied = Object.keys(days)
    .filter((k) => (days[k] ?? 0) >= STREAK_MIN_SECONDS && /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();
  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const key of studied) {
    const [y, m, d] = key.split("-").map(Number) as [number, number, number];
    const date = new Date(y, m - 1, d);
    if (previous) {
      const next = new Date(previous);
      next.setDate(next.getDate() + 1);
      run = dayKey(next) === key ? run + 1 : 1;
    } else run = 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

/** Days studied (with at least the streak minimum) among the last `count` days. */
export function activeDays(days: Record<string, number>, today: Date, count: number): number {
  return lastDays(days, today, count).filter((d) => d.seconds >= STREAK_MIN_SECONDS).length;
}

export interface StudiedDoc {
  path: string;
  name: string;
  studySeconds: number;
  /** Per-day seconds (recorded from LumiPDF 2.0 on). */
  studyDays?: Record<string, number>;
}

export interface Ranked {
  key: string;
  label: string;
  seconds: number;
}

/**
 * Documents ranked by study time over the last `count` days (null = all time, which also counts
 * time recorded before per-day tracking existed).
 */
export function topDocuments(docs: StudiedDoc[], today: Date, count: number | null, limit = 8): Ranked[] {
  const keys = count === null ? null : new Set(lastDays({}, today, count).map((d) => d.day));
  return docs
    .map((d) => ({
      key: d.path,
      label: d.name.replace(/\.pdf$/i, ""),
      seconds: keys === null ? d.studySeconds : Object.entries(d.studyDays ?? {}).reduce((s, [day, sec]) => (keys.has(day) ? s + sec : s), 0),
    }))
    .filter((r) => r.seconds >= 60)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit);
}

/**
 * Library folders (courses) ranked by the study time of the documents inside them. A document
 * belongs to the deepest folder that contains it; documents outside every folder go to "Other".
 */
export function topFolders(docs: StudiedDoc[], folders: Array<{ path: string; name: string }>, today: Date, count: number | null, otherLabel: string): Ranked[] {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const sorted = [...folders].sort((a, b) => b.path.length - a.path.length);
  const totals = new Map<string, Ranked>();
  for (const doc of topDocuments(docs, today, count, Number.MAX_SAFE_INTEGER)) {
    const path = norm(doc.key);
    const folder = sorted.find((f) => path.startsWith(norm(f.path) + "/"));
    const key = folder?.path ?? "";
    const entry = totals.get(key) ?? { key, label: folder?.name ?? otherLabel, seconds: 0 };
    entry.seconds += doc.seconds;
    totals.set(key, entry);
  }
  return [...totals.values()].sort((a, b) => b.seconds - a.seconds);
}

/** "1h 05m" style short label for chart tooltips and goal rings. */
export function shortDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}
