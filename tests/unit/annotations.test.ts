import { describe, expect, it } from "vitest";
import { cutStroke, hits, mergeLineRects, parseAnnotations, thinPoints, type Annotation, type Ink, type TextMark } from "../../src/lib/annotations/model";

describe("annotations", () => {
  it("keeps valid annotations and drops broken ones", () => {
    const list = parseAnnotations({
      annotations: [
        { id: "a", type: "ink", page: 1, color: "#112233", width: 2, points: [0, 0, 0.5, 10, 10, 0.5] },
        { id: "b", type: "ink", page: 1, color: "red", width: 2, points: [0, 0, 0.5] },
        { id: "c", type: "highlight", page: 2, color: "#ffe14d", rects: [[0, 0, 10, 10]], text: "x" },
        { id: "d", type: "note", page: 0, color: "#ffd84d", x: 1, y: 1 },
        { id: "e", type: "script", page: 1, color: "#ffffff" },
        null,
      ],
    });
    expect(list.map((a) => a.id)).toEqual(["a", "c"]);
    expect((list[1] as TextMark).note).toBe("");
    expect(parseAnnotations("garbage")).toEqual([]);
  });

  it("hit-tests strokes, marks and notes", () => {
    const ink: Annotation = { id: "i", type: "ink", page: 1, created: 0, color: "#000000", width: 2, points: [0, 0, 0.5, 100, 0, 0.5] };
    expect(hits(ink, 50, 2, 1)).toBe(true);
    expect(hits(ink, 50, 10, 1)).toBe(false);
    const mark: Annotation = { id: "m", type: "underline", page: 1, created: 0, color: "#000000", rects: [[10, 10, 50, 20]], text: "", note: "" };
    expect(hits(mark, 30, 15, 0)).toBe(true);
    expect(hits(mark, 60, 15, 0)).toBe(false);
  });

  it("merges selection rects into one per line", () => {
    const merged = mergeLineRects([
      [10, 100, 40, 112],
      [41, 100.5, 90, 111.5],
      [10, 85, 70, 97],
      [5, 5, 5.2, 5.1],
    ]);
    expect(merged).toEqual([
      [10, 100, 90, 112],
      [10, 85, 70, 97],
    ]);
  });

  it("thins pointer jitter but keeps the ends", () => {
    const pts = [0, 0, 0.5, 0.1, 0, 0.5, 0.2, 0, 0.5, 5, 0, 0.5, 5.1, 0, 0.5];
    expect(thinPoints(pts, 1)).toEqual([0, 0, 0.5, 5, 0, 0.5, 5.1, 0, 0.5]);
  });
});

describe("partial eraser", () => {
  const line: Ink = { id: "a", type: "ink", page: 1, created: 0, color: "#000", width: 2, points: [0, 0, 0.5, 100, 0, 0.5] };

  it("cuts a straight line in two around the eraser", () => {
    const pieces = cutStroke(line, 50, 0, 5);
    expect(pieces).toHaveLength(2);
    const [left, right] = pieces;
    expect(left!.points[0]).toBe(0);
    expect(Math.max(...left!.points.filter((_, i) => i % 3 === 0))).toBeLessThan(45.1);
    expect(Math.min(...right!.points.filter((_, i) => i % 3 === 0))).toBeGreaterThan(54.9);
    expect(right!.points.at(-3)).toBe(100);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(2);
    expect(pieces.every((p) => p.id !== "a" && p.color === "#000")).toBe(true);
  });

  it("removes a stroke completely covered, and keeps one end when erasing the other", () => {
    expect(cutStroke(line, 50, 0, 80)).toHaveLength(0);
    const end = cutStroke(line, 100, 0, 10);
    expect(end).toHaveLength(1);
    expect(Math.max(...end[0]!.points.filter((_, i) => i % 3 === 0))).toBeLessThan(90.1);
  });
});
