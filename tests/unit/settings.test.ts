import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "../../src/lib/settings/schema";
import { autoDarkWanted, inDarkPeriod } from "../../src/lib/dark/auto";

const at = (h: number, m = 0) => new Date(2026, 10, 3, h, m);

describe("settings", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ reading: { theme: "pink", tuning: { brightness: 9 }, auto: { darkFrom: "25:00" } } })).toEqual({
      ...DEFAULT_SETTINGS,
      reading: { ...DEFAULT_SETTINGS.reading, tuning: { ...DEFAULT_SETTINGS.reading.tuning, brightness: 1.15 } },
    });
  });

  it("keeps valid values", () => {
    const s = parseSettings({ reading: { darkEnabled: false, theme: "night-paper", auto: { mode: "schedule", darkFrom: "20:30", darkUntil: "06:15" } } });
    expect(s.reading.darkEnabled).toBe(false);
    expect(s.reading.theme).toBe("night-paper");
    expect(s.reading.auto).toEqual({ mode: "schedule", darkFrom: "20:30", darkUntil: "06:15" });
  });

  it("keeps timer lengths whole and within limits", () => {
    const s = parseSettings({ timer: { focus: 37.4, shortBreak: 0, longBreak: 999, sessionsBeforeLong: "4" } });
    expect(s.timer).toEqual({ ...DEFAULT_SETTINGS.timer, focus: 37, shortBreak: 1, longBreak: 180 });
  });

  it("validates app preferences", () => {
    const s = parseSettings({ app: { appearance: "dark", locale: "../../x", lastSeenVersion: "2.0.0" } });
    expect(s.app.appearance).toBe("dark");
    expect(s.app.locale).toBe("");
    expect(s.app.lastSeenVersion).toBe("2.0.0");
  });
});

describe("auto theme", () => {
  it("handles schedules that wrap past midnight", () => {
    expect(inDarkPeriod(at(23), "19:00", "07:00")).toBe(true);
    expect(inDarkPeriod(at(3), "19:00", "07:00")).toBe(true);
    expect(inDarkPeriod(at(7), "19:00", "07:00")).toBe(false);
    expect(inDarkPeriod(at(12), "19:00", "07:00")).toBe(false);
  });

  it("handles same-day schedules", () => {
    expect(inDarkPeriod(at(14), "13:00", "15:00")).toBe(true);
    expect(inDarkPeriod(at(15), "13:00", "15:00")).toBe(false);
  });

  it("follows the system or the schedule, or stays out of the way", () => {
    const r = DEFAULT_SETTINGS.reading;
    expect(autoDarkWanted({ ...r, auto: { ...r.auto, mode: "off" } }, at(23), true)).toBeNull();
    expect(autoDarkWanted({ ...r, auto: { ...r.auto, mode: "system" } }, at(12), true)).toBe(true);
    expect(autoDarkWanted({ ...r, auto: { ...r.auto, mode: "schedule" } }, at(12), true)).toBe(false);
  });
});
