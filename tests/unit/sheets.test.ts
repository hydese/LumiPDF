import { describe, expect, it } from "vitest";
import { GAP, MARGIN, PAPER, layoutSheet, newSheet, parseSheet, snapBox, textWidth, toFlow, toFree, wrapText, type SheetItem } from "../../src/lib/sheets/model";

const snip = (id: string, w: number, h: number, scale = 1): SheetItem => ({
  id,
  type: "snip",
  image: "0".repeat(32) + ".png",
  px: [w * 4, h * 4],
  natural: [w, h],
  scale,
  source: { path: "C:\\a.pdf", name: "a.pdf", page: 1 },
});
const title = (id: string): SheetItem => ({ id, type: "title", text: id });

describe("formula sheet layout", () => {
  it("fills columns, then pages", () => {
    const sheet = { ...newSheet("S", "a4"), columns: 2 as const, items: Array.from({ length: 9 }, (_, i) => snip(`s${i}`, 200, 300)) };
    const { placed, pages, column } = layoutSheet(sheet);
    // Two 300 pt items per column on A4 (842 pt tall, 32 pt margins).
    expect(placed.map((p) => [p.page, p.x < PAPER.a4.w / 2 ? 0 : 1])).toEqual([
      [0, 0], [0, 0], [0, 1], [0, 1], [1, 0], [1, 0], [1, 1], [1, 1], [2, 0],
    ]);
    expect(pages).toBe(3);
    expect(placed[1]!.y).toBe(MARGIN + 300 + GAP);
    expect(column).toBeCloseTo((PAPER.a4.w - 2 * MARGIN - 16) / 2);
  });

  it("caps pictures at the column width and keeps their shape", () => {
    const sheet = { ...newSheet("S", "letter"), columns: 3 as const, items: [snip("wide", 600, 100), snip("small", 50, 20, 2)] };
    const [wide, small] = layoutSheet(sheet).placed;
    expect(wide!.w).toBeCloseTo(layoutSheet(sheet).column);
    expect(wide!.h).toBeCloseTo((wide!.w * 100) / 600);
    expect([small!.w, small!.h]).toEqual([100, 40]);
  });

  it("never leaves a title alone at the bottom of a column", () => {
    const sheet = { ...newSheet("S", "a4"), columns: 1 as const, items: [snip("a", 300, 700), title("T"), snip("b", 300, 200)] };
    const [, t, b] = layoutSheet(sheet).placed;
    expect(t!.page).toBe(1);
    expect(b!.page).toBe(1);
    expect(t!.y).toBe(MARGIN);
  });

  it("switches between flow and free without moving anything", () => {
    const sheet = { ...newSheet("S", "a4"), items: [title("T"), snip("a", 200, 100), snip("b", 200, 100)] };
    const before = layoutSheet(sheet).placed.map((p) => [p.page, p.x, p.y, p.w]);
    const free = toFree(sheet);
    expect(layoutSheet(free).placed.map((p) => [p.page, p.x, p.y, p.w])).toEqual(before);
    // Moving b above a in free mode changes the flow order.
    free.items[2] = { ...free.items[2]!, free: { ...free.items[2]!.free!, y: 0 } };
    expect(toFlow(free).items.map((i) => i.id)).toEqual(["b", "T", "a"]);
  });

  it("reads only valid sheets", () => {
    expect(parseSheet(null, "x")).toBeNull();
    const sheet = parseSheet(
      { title: "A".repeat(500), columns: 7, paper: "tabloid", items: [{ type: "snip", image: "../x.png", px: [1, 1], natural: [1, 1] }, { type: "title", text: "Hi" }, snip("ok", 10, 10)] },
      "id1",
    )!;
    expect(sheet.title).toHaveLength(120);
    expect(sheet.columns).toBe(2);
    expect(sheet.paper).toBe("a4");
    expect(sheet.items.map((i) => i.type)).toEqual(["title", "snip"]);
  });
});

describe("smart guides", () => {
  const paper = PAPER.a4;
  it("snaps to the page centre and to other items", () => {
    // Centre 3 pt off the page centre: snaps, with a vertical guide at the centre.
    const s = snapBox({ x: paper.w / 2 - 50 + 3, y: 300, w: 100, h: 40 }, [], paper, 5);
    expect(s.x).toBeCloseTo(paper.w / 2 - 50);
    expect(s.vertical).toContain(paper.w / 2);
    // Top edge 2 pt below another item's bottom: snaps to it.
    const t = snapBox({ x: 100, y: 202, w: 80, h: 30 }, [{ x: 300, y: 150, w: 60, h: 50 }], paper, 5);
    expect(t.y).toBe(200);
    expect(t.horizontal).toContain(200);
  });
  it("leaves far boxes alone", () => {
    const s = snapBox({ x: 123, y: 456, w: 50, h: 20 }, [], paper, 4);
    expect([s.x, s.y, s.vertical.length, s.horizontal.length]).toEqual([123, 456, 0, 0]);
  });
});

describe("text boxes", () => {
  it("wraps by Helvetica widths and keeps line breaks", () => {
    expect(textWidth("AAAA", 10)).toBeCloseTo(26.68, 2);
    const lines = wrapText("one two three four five six seven", 10, 60);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(textWidth(l, 10)).toBeLessThanOrEqual(60);
    expect(lines.join(" ")).toBe("one two three four five six seven");
    expect(wrapText("a\n\nb", 10, 100)).toEqual(["a", "", "b"]);
  });

  it("splits a word longer than the box", () => {
    const lines = wrapText("x".repeat(80), 10, 50);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textWidth(l, 10)).toBeLessThanOrEqual(50);
    expect(lines.join("")).toBe("x".repeat(80));
  });

  it("grows with its text in the layout and survives a reload", () => {
    const sheet = newSheet("S", "a4");
    const short: SheetItem = { id: "t1", type: "text", text: "hi", size: 10 };
    const long: SheetItem = { id: "t2", type: "text", text: "word ".repeat(200), size: 10 };
    sheet.items = [short, long];
    const placed = layoutSheet(sheet).placed;
    expect(placed[0]!.h).toBeCloseTo(13, 5);
    expect(placed[1]!.h).toBeGreaterThan(placed[0]!.h * 5);
    const back = parseSheet(JSON.parse(JSON.stringify(sheet)), sheet.id)!;
    expect(back.items[1]).toMatchObject({ type: "text", size: 10 });
  });
});
