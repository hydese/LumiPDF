/**
 * Annotations in the shape the Rust exporter writes into the PDF. Pen and highlighter strokes
 * are sent as the same filled outline the reader draws (perfect-freehand), so the exported
 * file looks like the screen.
 */
import { getStroke } from "perfect-freehand";
import type { ExportAnnotation } from "../ipc/export";
import type { Annotation } from "./model";

function outlineOf(points: number[], width: number, ink: boolean): number[] {
  const pts: number[][] = [];
  for (let i = 0; i < points.length; i += 3) pts.push([points[i]!, points[i + 1]!, points[i + 2]!]);
  const realPressure = points.some((v, i) => i % 3 === 2 && v !== 0.5);
  const stroke = ink
    ? getStroke(pts, { size: width * 1.6, thinning: 0.55, smoothing: 0.5, streamline: 0.45, simulatePressure: !realPressure, last: true })
    : getStroke(pts, { size: width, thinning: 0, smoothing: 0.6, streamline: 0.5, simulatePressure: false, start: { cap: false }, end: { cap: false }, last: true });
  return stroke.flatMap(([x, y]) => [round(x!), round(y!)]);
}

const round = (v: number) => Math.round(v * 100) / 100;

export function toExport(list: Annotation[]): ExportAnnotation[] {
  const out: ExportAnnotation[] = [];
  for (const a of list) {
    switch (a.type) {
      case "highlight":
      case "underline":
      case "strike":
        out.push({ type: "mark", page: a.page, kind: a.type, color: a.color, rects: a.rects, comment: a.note });
        break;
      case "ink":
      case "marker": {
        const outline = outlineOf(a.points, a.width, a.type === "ink");
        const line: number[] = [];
        for (let i = 0; i < a.points.length; i += 3) line.push(round(a.points[i]!), round(a.points[i + 1]!));
        if (outline.length >= 6) out.push({ type: "ink", page: a.page, color: a.color, width: a.width, marker: a.type === "marker", line, outline });
        break;
      }
      case "note":
        out.push({ type: "note", page: a.page, color: a.color, x: a.x, y: a.y, text: a.text });
        break;
    }
  }
  return out;
}
