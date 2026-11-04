import { describe, expect, it } from "vitest";
import { READING_THRESHOLD_S, studyStep } from "../../src/lib/timer/study.svelte";
import { formatAlarm, formatClock, formatStopwatch, msUntil } from "../../src/lib/timer/format";

describe("study time rules", () => {
  const run = (ticks: Array<{ timing: boolean; reading: boolean }>, step = 15) => {
    let state = { run: 0, pending: 0 };
    let total = 0;
    for (const tick of ticks) {
      const r = studyStep(state.run, state.pending, tick, step);
      total += r.count;
      state = r;
    }
    return total;
  };
  const reading = { timing: false, reading: true };
  const idle = { timing: false, reading: false };
  const timing = { timing: true, reading: false };

  it("counts timers straight away", () => {
    expect(run(Array(4).fill(timing))).toBe(60);
  });

  it("counts reading only after 10 minutes in a row, including those 10 minutes", () => {
    const n = READING_THRESHOLD_S / 15;
    expect(run(Array(n - 1).fill(reading))).toBe(0);
    expect(run(Array(n).fill(reading))).toBe(READING_THRESHOLD_S);
    expect(run(Array(n + 4).fill(reading))).toBe(READING_THRESHOLD_S + 60);
  });

  it("drops short reading runs", () => {
    const n = READING_THRESHOLD_S / 15;
    expect(run([...Array(n - 2).fill(reading), idle, ...Array(n - 2).fill(reading)])).toBe(0);
  });
});

describe("clock formats", () => {
  it("formats countdowns and stopwatches", () => {
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(61_001)).toBe("01:02");
    expect(formatClock(3_725_000)).toBe("1:02:05");
    expect(formatStopwatch(754_560)).toBe("12:34.5");
  });

  it("shows the alarm in 24 or 12 hour format", () => {
    expect(formatAlarm("07:30", true)).toBe("07:30");
    expect(formatAlarm("07:30", false)).toBe("7:30 AM");
    expect(formatAlarm("00:05", false)).toBe("12:05 AM");
    expect(formatAlarm("12:00", false)).toBe("12:00 PM");
    expect(formatAlarm("19:45", false)).toBe("7:45 PM");
  });

  it("finds the next alarm time", () => {
    const now = new Date(2026, 10, 4, 7, 0, 0);
    expect(msUntil("07:30", now)).toBe(30 * 60_000);
    expect(msUntil("06:59", now)).toBe((24 * 60 - 1) * 60_000);
    expect(msUntil("07:00", now)).toBe(24 * 3600_000);
  });
});
