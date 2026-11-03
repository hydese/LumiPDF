/** Local calendar day as "YYYY-MM-DD" (the key used for study time). */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Days in a row with some study, ending today (or yesterday, if today has none yet). */
export function studyStreak(days: Record<string, number>, today: Date, minSeconds = 60): number {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if ((days[dayKey(day)] ?? 0) < minSeconds) day.setDate(day.getDate() - 1);
  let streak = 0;
  while ((days[dayKey(day)] ?? 0) >= minSeconds) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

/** Total seconds over the 7 days ending today. */
export function weekTotal(days: Record<string, number>, today: Date): number {
  let total = 0;
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = 0; i < 7; i++) {
    total += days[dayKey(day)] ?? 0;
    day.setDate(day.getDate() - 1);
  }
  return total;
}
