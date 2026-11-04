/** "36:48", or "1:05:00" for an hour or more. Rounds up, so a countdown never shows 0:00 early. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Stopwatch: "12:34.5", "1:02:03.4". Rounds down. */
export function formatStopwatch(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const total = Math.floor(tenths / 10);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}

/** Alarm time for display: "07:30" or "7:30 AM". `hhmm` is stored 24-hour. */
export function formatAlarm(hhmm: string, clock24: boolean, am = "AM", pm = "PM"): string {
  if (clock24) return hhmm;
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? am : pm}`;
}

/** Milliseconds from `now` until the next time the clock shows "HH:MM" (today or tomorrow). */
export function msUntil(hhmm: string, now: Date): number {
  const [h, m] = hhmm.split(":").map(Number);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h ?? 0, m ?? 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}
