import { describe, expect, it } from "vitest";
import { activeDays, bestStreak, currentStreak, lastDays, rangeTotal, shortDuration, topDocuments, topFolders, type StudiedDoc } from "../../src/lib/stats/stats";

const today = new Date(2026, 10, 4, 15, 0); // 4 Nov 2026
const days = { "2026-11-04": 600, "2026-11-03": 3600, "2026-11-02": 30, "2026-11-01": 1200, "2026-10-31": 1200, "2026-10-30": 1200, "2026-03-01": 9000 };

describe("study stats", () => {
  it("lists the last days oldest first", () => {
    const week = lastDays(days, today, 7);
    expect(week).toHaveLength(7);
    expect(week[0]!.day).toBe("2026-10-29");
    expect(week[6]!.day).toBe("2026-11-04");
    expect(rangeTotal(days, today, 7)).toBe(600 + 3600 + 30 + 1200 * 3);
  });

  it("counts streaks with at least a minute a day", () => {
    expect(currentStreak(days, today)).toBe(2); // 2 Nov had only 30 s
    expect(bestStreak(days)).toBe(3); // 30 Oct – 1 Nov
    expect(activeDays(days, today, 7)).toBe(5);
    // Nothing yet today: the streak still counts up to yesterday.
    expect(currentStreak({ "2026-11-03": 120 }, today)).toBe(1);
  });

  it("crosses month and year boundaries", () => {
    expect(bestStreak({ "2025-12-31": 100, "2026-01-01": 100, "2026-01-02": 100 })).toBe(3);
  });

  it("ranks documents and folders", () => {
    const docs: StudiedDoc[] = [
      { path: "C:\\Uni\\Analisi\\L1.pdf", name: "L1.pdf", studySeconds: 5000, studyDays: { "2026-11-04": 600 } },
      { path: "C:\\Uni\\Analisi\\L2.pdf", name: "L2.pdf", studySeconds: 100, studyDays: { "2026-11-03": 120 } },
      { path: "C:\\Uni\\Fisica\\F.pdf", name: "F.pdf", studySeconds: 900, studyDays: { "2026-10-01": 900 } },
      { path: "D:\\x.pdf", name: "x.pdf", studySeconds: 400 },
    ];
    expect(topDocuments(docs, today, 7).map((r) => r.label)).toEqual(["L1", "L2"]);
    expect(topDocuments(docs, today, null).map((r) => r.seconds)).toEqual([5000, 900, 400, 100]);
    const folders = [
      { path: "C:\\Uni", name: "Uni" },
      { path: "C:\\Uni\\Analisi", name: "Analisi" },
    ];
    expect(topFolders(docs, folders, today, null, "Other")).toEqual([
      { key: "C:\\Uni\\Analisi", label: "Analisi", seconds: 5100 },
      { key: "C:\\Uni", label: "Uni", seconds: 900 },
      { key: "", label: "Other", seconds: 400 },
    ]);
  });

  it("formats short durations", () => {
    expect(shortDuration(59 * 60)).toBe("59m");
    expect(shortDuration(65 * 60)).toBe("1h 05m");
    expect(shortDuration(2 * 3600)).toBe("2h");
  });
});

import { sortFiles } from "../../src/lib/library/sorting";
describe("folder sorting", () => {
  const files = [{ name: "Lezione 10.pdf", path: "a" }, { name: "lezione 2.pdf", path: "b" }, { name: "Esame.pdf", path: "c" }];
  const opened: Record<string, number> = { a: 5, c: 9 };
  it("sorts by name (numbers in order, ignoring case) and by recency", () => {
    expect(sortFiles(files, "name", () => 0).map((f) => f.path)).toEqual(["c", "b", "a"]);
    expect(sortFiles(files, "name-desc", () => 0).map((f) => f.path)).toEqual(["a", "b", "c"]);
    expect(sortFiles(files, "recent", (p) => opened[p] ?? 0).map((f) => f.path)).toEqual(["c", "a", "b"]);
  });
});
