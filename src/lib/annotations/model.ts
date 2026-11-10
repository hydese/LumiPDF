/**
 * Annotations: what they are, how they're stored, and the geometry to hit-test them.
 *
 * Coordinates are PDF user-space points (origin bottom-left, y up), the same space PDF files use
 * for their own annotations, so they survive zoom, rotation and crop boxes, and export later
 * maps 1:1. Colours are stored as the user picked them (light-page colours); dark mode maps them
 * at draw time.
 */

export type MarkKind = "highlight" | "underline" | "strike";

interface Base {
  id: string;
  /** 1-based page number. */
  page: number;
  /** Milliseconds since 1970. */
  created: number;
}

/** Pen ink: flat [x, y, pressure, x, y, pressure, ...]. */
export interface Ink extends Base {
  type: "ink";
  color: string;
  /** Nominal width in points. */
  width: number;
  points: number[];
}

/** Freehand highlighter, drawn underneath the text colour (multiply). */
export interface Marker extends Base {
  type: "marker";
  color: string;
  width: number;
  points: number[];
}

/** Highlight / underline / strike-through on selected text. Rects are [x1, y1, x2, y2]. */
export interface TextMark extends Base {
  type: MarkKind;
  color: string;
  rects: Array<[number, number, number, number]>;
  /** The marked text, shown in the Notes list. */
  text: string;
  /** Optional comment attached to the mark. */
  note: string;
}

/** A sticky note at a point. */
export interface Note extends Base {
  type: "note";
  color: string;
  x: number;
  y: number;
  text: string;
}

export type Annotation = Ink | Marker | TextMark | Note;

export interface AnnotationFile {
  version: 1;
  annotations: Annotation[];
}

export const PALETTE = {
  ink: ["#1d1d1f", "#2f5bd8", "#d93a2b", "#1f8a4c", "#8a3ffc", "#e07b00"],
  marker: ["#ffe14d", "#9be38f", "#8fd3ff", "#ffa8d2", "#ffb86b"],
  note: ["#ffd84d", "#9be38f", "#8fd3ff", "#ffa8d2"],
} as const;

export const WIDTHS = {
  ink: [1, 1.8, 3],
  marker: [8, 13, 20],
} as const;

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------------------------
// Validation (files are user data on disk: never trust them)

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown, max = 20_000): string => (typeof v === "string" ? v.slice(0, max) : "");

function points(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length < 3 || v.length % 3 !== 0 || v.length > 30_000) return null;
  return v.every(num) ? (v as number[]) : null;
}

function rects(v: unknown): Array<[number, number, number, number]> | null {
  if (!Array.isArray(v) || !v.length || v.length > 2000) return null;
  const out: Array<[number, number, number, number]> = [];
  for (const r of v) {
    if (!Array.isArray(r) || r.length !== 4 || !r.every(num)) return null;
    out.push(r as [number, number, number, number]);
  }
  return out;
}

/** Keeps every valid annotation in `raw`, drops the rest. */
export function parseAnnotations(raw: unknown): Annotation[] {
  const list = (raw && typeof raw === "object" && Array.isArray((raw as { annotations?: unknown }).annotations)
    ? (raw as { annotations: unknown[] }).annotations
    : []) as Array<Record<string, unknown>>;
  const out: Annotation[] = [];
  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    const base = {
      id: str(a.id, 64) || newId(),
      page: num(a.page) && a.page >= 1 ? Math.floor(a.page) : 0,
      created: num(a.created) ? a.created : 0,
    };
    const color = typeof a.color === "string" && HEX.test(a.color) ? a.color : null;
    if (!base.page || !color) continue;
    if (a.type === "ink" || a.type === "marker") {
      const p = points(a.points);
      if (p && num(a.width) && a.width > 0 && a.width < 100) out.push({ ...base, type: a.type, color, width: a.width, points: p });
    } else if (a.type === "highlight" || a.type === "underline" || a.type === "strike") {
      const r = rects(a.rects);
      if (r) out.push({ ...base, type: a.type, color, rects: r, text: str(a.text), note: str(a.note) });
    } else if (a.type === "note") {
      if (num(a.x) && num(a.y)) out.push({ ...base, type: "note", color, x: a.x, y: a.y, text: str(a.text) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Geometry

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** True if the PDF point (x, y) touches `a`, with `tolerance` in points. */
export function hits(a: Annotation, x: number, y: number, tolerance: number): boolean {
  switch (a.type) {
    case "ink":
    case "marker": {
      const reach = tolerance + a.width / 2;
      const p = a.points;
      if (p.length === 3) return Math.hypot(x - p[0]!, y - p[1]!) <= reach;
      for (let i = 0; i + 5 < p.length; i += 3) {
        if (distToSegment(x, y, p[i]!, p[i + 1]!, p[i + 3]!, p[i + 4]!) <= reach) return true;
      }
      return false;
    }
    case "note":
      return Math.abs(x - a.x) <= 10 + tolerance && Math.abs(y - a.y) <= 10 + tolerance;
    default:
      return a.rects.some(([x1, y1, x2, y2]) => x >= x1 - tolerance && x <= x2 + tolerance && y >= y1 - tolerance && y <= y2 + tolerance);
  }
}

/**
 * Merges the many small rectangles a text selection produces (one per text run) into one per
 * line. Input and output are [x1, y1, x2, y2] with x1 < x2, y1 < y2.
 */
export function mergeLineRects(input: Array<[number, number, number, number]>): Array<[number, number, number, number]> {
  const sorted = input
    .filter(([x1, y1, x2, y2]) => x2 - x1 > 0.5 && y2 - y1 > 0.5)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const lines: Array<[number, number, number, number]> = [];
  for (const r of sorted) {
    const line = lines.find((l) => {
      const overlap = Math.min(l[3], r[3]) - Math.max(l[1], r[1]);
      return overlap > 0.5 * Math.min(l[3] - l[1], r[3] - r[1]);
    });
    if (line) {
      line[0] = Math.min(line[0], r[0]);
      line[1] = Math.min(line[1], r[1]);
      line[2] = Math.max(line[2], r[2]);
      line[3] = Math.max(line[3], r[3]);
    } else {
      lines.push([...r]);
    }
  }
  return lines;
}

/** Keeps at most one point per `minStep` points of travel (drops pointer jitter). */
export function thinPoints(points: number[], minStep: number): number[] {
  if (points.length <= 6) return points;
  const out = points.slice(0, 3);
  for (let i = 3; i < points.length - 3; i += 3) {
    const lx = out[out.length - 3]!;
    const ly = out[out.length - 2]!;
    if (Math.hypot(points[i]! - lx, points[i + 1]! - ly) >= minStep) out.push(points[i]!, points[i + 1]!, points[i + 2]!);
  }
  out.push(...points.slice(-3));
  return out;
}

/**
 * What is left of a pen or highlighter stroke after erasing a circle (x, y, radius r): the
 * stroke is sampled finely enough (straight lines have only two points), the points inside the
 * circle are dropped, and each remaining run of two or more points becomes its own stroke.
 */
export function cutStroke<T extends Ink | Marker>(a: T, x: number, y: number, r: number): T[] {
  const src = a.points;
  const pts: number[] = [];
  const step = Math.max(r / 2, 0.25);
  for (let i = 0; i < src.length; i += 3) {
    if (i > 0) {
      const x0 = src[i - 3]!, y0 = src[i - 2]!, p0 = src[i - 1]!;
      const x1 = src[i]!, y1 = src[i + 1]!, p1 = src[i + 2]!;
      const n = Math.min(200, Math.floor(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        pts.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p0 + (p1 - p0) * t);
      }
    }
    pts.push(src[i]!, src[i + 1]!, src[i + 2]!);
  }
  const pieces: T[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 6) pieces.push({ ...a, id: newId(), points: run });
    run = [];
  };
  for (let i = 0; i < pts.length; i += 3) {
    if (Math.hypot(pts[i]! - x, pts[i + 1]! - y) <= r) flush();
    else run.push(pts[i]!, pts[i + 1]!, pts[i + 2]!);
  }
  flush();
  return pieces;
}
