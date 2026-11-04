/**
 * Formula sheets: the document format and the page layout. Pure, tested in
 * tests/unit/sheets.test.ts.
 *
 * Units are PDF points (1/72 inch) with the origin at a page's top left, so what you see is
 * exactly what the exported PDF gets.
 *
 * Two layouts:
 *  - "flow": items fill columns top to bottom, then the next column, then the next page. You
 *    reorder, resize (a share of the column) and add titles; it always stays tidy.
 *  - "free": every item has its own page and position, like a canvas.
 */
import type { SheetPaper } from "../settings/schema";

export type SheetLayout = "flow" | "free";

export interface FreeSpot {
  page: number;
  x: number;
  y: number;
  /** Width in points (height follows the picture's shape). */
  w: number;
}

export interface SnipItem {
  id: string;
  type: "snip";
  /** Picture name in LumiPDF's sheet folder. */
  image: string;
  /** Picture size in pixels (its shape). */
  px: [number, number];
  /** Size in the original document, in points: the printed size at 100%. */
  natural: [number, number];
  /** Flow: size relative to the natural size (capped at the column width). */
  scale: number;
  source: { path: string; name: string; page: number };
  free?: FreeSpot;
}

export interface TitleItem {
  id: string;
  type: "title";
  text: string;
  free?: FreeSpot;
}

export type SheetItem = SnipItem | TitleItem;

export interface Sheet {
  version: 1;
  id: string;
  title: string;
  created: number;
  modified: number;
  paper: SheetPaper;
  layout: SheetLayout;
  columns: 1 | 2 | 3;
  /** Free layout: number of pages (flow computes its own). */
  pages: number;
  items: SheetItem[];
}

export const PAPER: Record<SheetPaper, { w: number; h: number }> = {
  a4: { w: 595.28, h: 841.89 },
  letter: { w: 612, h: 792 },
};
export const MARGIN = 32;
export const GUTTER = 16;
export const GAP = 10;
export const TITLE_SIZE = 13;
export const TITLE_HEIGHT = 22;
export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;
export const MAX_PAGES = 200;

export interface Placed {
  item: SheetItem;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  pages: number;
  placed: Placed[];
  /** Flow: column width. */
  column: number;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newSheet(title: string, paper: SheetPaper): Sheet {
  const now = Date.now();
  return { version: 1, id: newId(), title, created: now, modified: now, paper, layout: "flow", columns: 2, pages: 1, items: [] };
}

function columnWidth(sheet: Sheet): number {
  const { w } = PAPER[sheet.paper];
  return (w - 2 * MARGIN - (sheet.columns - 1) * GUTTER) / sheet.columns;
}

/** Size of an item inside a column of `column` points (flow layout). */
export function flowSize(item: SheetItem, column: number): { w: number; h: number } {
  if (item.type === "title") return { w: column, h: TITLE_HEIGHT };
  const [nw, nh] = item.natural;
  const w = Math.min(column, Math.max(12, nw * item.scale));
  return { w, h: (w * nh) / nw };
}

/** Where everything goes. */
export function layoutSheet(sheet: Sheet): Layout {
  const paper = PAPER[sheet.paper];
  const column = columnWidth(sheet);
  if (sheet.layout === "free") {
    const placed = sheet.items.map((item) => {
      const spot = item.free ?? { page: 0, x: MARGIN, y: MARGIN, w: column };
      const h = item.type === "title" ? TITLE_HEIGHT : (spot.w * item.natural[1]) / item.natural[0];
      return { item, page: spot.page, x: spot.x, y: spot.y, w: item.type === "title" ? Math.max(40, spot.w) : spot.w, h };
    });
    const pages = Math.max(sheet.pages, 1, ...placed.map((p) => p.page + 1));
    return { pages: Math.min(pages, MAX_PAGES), placed, column };
  }
  const bottom = paper.h - MARGIN;
  const placed: Placed[] = [];
  let page = 0;
  let col = 0;
  let y = MARGIN;
  sheet.items.forEach((item, i) => {
    const { w, h } = flowSize(item, column);
    // A title keeps the next picture with it, so it never ends a column alone.
    const next = sheet.items[i + 1];
    const needed = item.type === "title" && next ? h + GAP + flowSize(next, column).h : h;
    // Next column (or page) when it doesn't fit, unless the column is empty (huge picture).
    if (y + Math.min(needed, bottom - MARGIN) > bottom && y > MARGIN) {
      col++;
      y = MARGIN;
      if (col >= sheet.columns) {
        col = 0;
        page++;
      }
    }
    const x = MARGIN + col * (column + GUTTER) + (item.type === "snip" ? (column - w) / 2 : 0);
    placed.push({ item, page, x, y, w, h });
    y += h + GAP;
  });
  return { pages: Math.min(page + 1, MAX_PAGES), placed, column };
}

/**
 * Free positions for every item, taken from the current flow layout, so switching to free
 * placement doesn't move anything.
 */
export function toFree(sheet: Sheet): Sheet {
  const layout = layoutSheet({ ...sheet, layout: "flow" });
  const items = sheet.items.map((item, i) => {
    const p = layout.placed[i]!;
    return { ...item, free: { page: p.page, x: p.x, y: p.y, w: p.w } };
  });
  return { ...sheet, layout: "free", items, pages: layout.pages };
}

/** Back to flow: reading order of the free layout (page, then top to bottom, left to right). */
export function toFlow(sheet: Sheet): Sheet {
  const order = sheet.items
    .map((item, i) => ({ item, i, s: item.free ?? { page: 0, x: 0, y: i, w: 0 } }))
    .sort((a, b) => a.s.page - b.s.page || a.s.y - b.s.y || a.s.x - b.s.x || a.i - b.i)
    .map((e) => e.item);
  return { ...sheet, layout: "flow", items: order };
}

/** Keeps a free spot on its page. */
export function clampSpot(sheet: Sheet, item: SheetItem, spot: FreeSpot): FreeSpot {
  const paper = PAPER[sheet.paper];
  const w = Math.min(paper.w, Math.max(item.type === "title" ? 40 : 12, spot.w));
  const h = item.type === "title" ? TITLE_HEIGHT : (w * item.natural[1]) / item.natural[0];
  return {
    page: Math.max(0, Math.min(MAX_PAGES - 1, Math.round(spot.page))),
    w,
    x: Math.max(0, Math.min(paper.w - w, spot.x)),
    y: Math.max(0, Math.min(paper.h - Math.min(h, paper.h), spot.y)),
  };
}

// ---------------------------------------------------------------------------------------------
// Reading files: never trust what's on disk.

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? v.slice(0, max) : d);

function parseSpot(v: unknown): FreeSpot | undefined {
  if (!v || typeof v !== "object") return undefined;
  const s = v as Record<string, unknown>;
  return { page: Math.round(num(s.page, 0, MAX_PAGES - 1, 0)), x: num(s.x, 0, 2000, MARGIN), y: num(s.y, 0, 2000, MARGIN), w: num(s.w, 12, 2000, 100) };
}

function pair(v: unknown, lo: number, hi: number): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [a, b] = v as unknown[];
  return typeof a === "number" && typeof b === "number" && a >= lo && b >= lo && a <= hi && b <= hi ? [a, b] : null;
}

export function parseSheet(raw: unknown, id: string): Sheet | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const items: SheetItem[] = [];
  for (const v of Array.isArray(r.items) ? r.items.slice(0, 2000) : []) {
    if (!v || typeof v !== "object") continue;
    const it = v as Record<string, unknown>;
    const itemId = str(it.id, 40) || newId();
    if (it.type === "title") {
      items.push({ id: itemId, type: "title", text: str(it.text, 200), free: parseSpot(it.free) });
    } else if (it.type === "snip" && typeof it.image === "string" && /^[0-9a-f]{32}\.png$/.test(it.image)) {
      const px = pair(it.px, 1, 100000);
      const natural = pair(it.natural, 0.5, 5000);
      const src = (it.source ?? {}) as Record<string, unknown>;
      if (!px || !natural) continue;
      items.push({
        id: itemId,
        type: "snip",
        image: it.image,
        px,
        natural,
        scale: num(it.scale, MIN_SCALE, MAX_SCALE, 1),
        source: { path: str(src.path, 4000), name: str(src.name, 400), page: Math.round(num(src.page, 1, 100000, 1)) },
        free: parseSpot(it.free),
      });
    }
  }
  const layout = r.layout === "free" ? "free" : "flow";
  const columns = r.columns === 1 || r.columns === 3 ? r.columns : 2;
  return {
    version: 1,
    id,
    title: str(r.title, 120) || "Formula sheet",
    created: num(r.created, 0, 1e15, Date.now()),
    modified: num(r.modified, 0, 1e15, Date.now()),
    paper: r.paper === "letter" ? "letter" : "a4",
    layout,
    columns,
    pages: Math.round(num(r.pages, 1, MAX_PAGES, 1)),
    items,
  };
}
