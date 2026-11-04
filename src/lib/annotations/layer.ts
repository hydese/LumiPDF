/**
 * Draws annotations on the pages and turns pointer input into annotations.
 *
 * Each drawn page gets two layers:
 * - a "marks" canvas between the page and its text layer, for highlighter strokes and text
 *   highlights. It blends like a real highlighter: multiply on light pages, screen on dark ones,
 *   so the text underneath keeps its colour and stays selectable.
 * - an "ink" layer on top, for pen ink, underlines, strike-throughs and sticky-note pins.
 *
 * Coordinates are PDF points; each page view's viewport converts them to screen pixels, so
 * annotations follow zoom, rotation and crop boxes. Colours go through the dark engine.
 */
import { getStroke } from "perfect-freehand";
import { isDarkActive, mapColor, onDarkModeChange } from "../dark/engine";
import type { PageViewLike, ViewerController } from "../viewer/ViewerController";
import { hits, mergeLineRects, newId, thinPoints, type Annotation, type Ink, type Marker, type MarkKind, type TextMark } from "./model";
import { annotations, type Tool } from "./store.svelte";

export interface LayerCallbacks {
  /** A sticky note pin was clicked (or a note was just placed). */
  onNoteOpen: (id: string, anchor: HTMLElement) => void;
  /** A text mark was clicked in select mode. */
  onMarkClick: (id: string, at: DOMRect) => void;
  /** Current tool settings (colour, width) for new annotations. */
  style: () => { inkColor: string; inkWidth: number; markerColor: string; markerWidth: number; markColor: string; markKind: MarkKind; noteColor: string };
}

interface PageLayers {
  view: PageViewLike;
  marks: HTMLCanvasElement;
  ink: HTMLDivElement;
  inkCanvas: HTMLCanvasElement;
}

interface LiveStroke {
  page: number;
  type: "ink" | "marker";
  points: number[];
  /** Real pen pressure (pen input); otherwise pressure is simulated from speed. */
  pressure: boolean;
  straight: boolean;
}

/** Eraser reach and click tolerance, in screen pixels. */
const ERASER_PX = 8;
const CLICK_PX = 4;

export class AnnotationLayer {
  #pages = new Map<number, PageLayers>();
  #live: LiveStroke | null = null;
  #erasing = new Set<string>();
  #erasePage = 0;
  #frame = 0;
  #down: { x: number; y: number; time: number } | null = null;
  #cleanups: Array<() => void> = [];
  #tool: Tool = "select";

  constructor(
    private readonly controller: ViewerController,
    private readonly cb: LayerCallbacks,
  ) {
    this.#cleanups.push(controller.onPageRendered((view) => this.#attach(view)));
    this.#cleanups.push(onDarkModeChange(() => this.redrawAll()));
    const c = controller.container;
    const opts = { capture: true } as const;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      c.addEventListener(type, fn, opts);
      this.#cleanups.push(() => c.removeEventListener(type, fn, opts));
    };
    on("pointerdown", (e) => this.#onDown(e));
    on("pointermove", (e) => this.#onMove(e));
    on("pointerup", (e) => this.#onUp(e));
    on("pointercancel", () => this.#cancel());
  }

  setTool(tool: Tool): void {
    this.#tool = tool;
    const c = this.controller.container;
    c.classList.toggle("tool-draw", tool === "pen" || tool === "marker" || tool === "eraser" || tool === "note");
    c.dataset.tool = tool;
  }

  destroy(): void {
    cancelAnimationFrame(this.#frame);
    for (const off of this.#cleanups) off();
    for (const p of this.#pages.values()) {
      p.marks.remove();
      p.ink.remove();
    }
    this.#pages.clear();
  }

  /** Redraws every page that has layers (after annotations or the theme change). */
  redrawAll(): void {
    for (const [page, layers] of this.#pages) {
      if (!layers.view.div.isConnected) this.#pages.delete(page);
      else this.#draw(layers);
    }
  }

  /** Forget layers (new document). */
  reset(): void {
    for (const p of this.#pages.values()) {
      p.marks.remove();
      p.ink.remove();
    }
    this.#pages.clear();
  }

  /**
   * Turns the current text selection into highlight / underline / strike marks (one per page).
   * Returns the created marks.
   */
  markSelection(kind: MarkKind, color: string): TextMark[] {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return [];
    const byPage = new Map<number, { rects: Array<[number, number, number, number]>; view: PageViewLike }>();
    const text = selection.toString().replace(/\s+/g, " ").trim();
    for (let i = 0; i < selection.rangeCount; i++) {
      for (const r of selection.getRangeAt(i).getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        const view = this.#viewAt(r.left + r.width / 2, r.top + r.height / 2);
        if (!view) continue;
        const box = view.div.getBoundingClientRect();
        const [x1, y1] = view.viewport.convertToPdfPoint(r.left - box.left, r.bottom - box.top);
        const [x2, y2] = view.viewport.convertToPdfPoint(r.right - box.left, r.top - box.top);
        const entry = byPage.get(view.id) ?? { rects: [], view };
        entry.rects.push([Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]);
        byPage.set(view.id, entry);
      }
    }
    const created: TextMark[] = [];
    for (const [page, { rects }] of byPage) {
      const merged = mergeLineRects(rects);
      if (!merged.length) continue;
      const mark: TextMark = { id: newId(), page, created: Date.now(), type: kind, color, rects: merged, text, note: "" };
      annotations.add(mark);
      created.push(mark);
    }
    selection.removeAllRanges();
    return created;
  }

  /** Screen rectangle of the current text selection if it lies on the pages. */
  selectionRect(): DOMRect | null {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!this.controller.container.contains(range.commonAncestorContainer)) return null;
    const rect = range.getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
  }

  /** Screen position of an annotation (to anchor a popover), if its page is drawn. */
  rectOf(a: Annotation): DOMRect | null {
    const layers = this.#pages.get(a.page);
    if (!layers) return null;
    const box = layers.view.div.getBoundingClientRect();
    const vp = layers.view.viewport;
    let x1: number, y1: number, x2: number, y2: number;
    if (a.type === "note") [x1, y1, x2, y2] = [a.x, a.y, a.x, a.y];
    else if (a.type === "ink" || a.type === "marker") [x1, y1, x2, y2] = [a.points[0]!, a.points[1]!, a.points[0]!, a.points[1]!];
    else [x1, y1, x2, y2] = a.rects[0]!;
    const [ax, ay] = vp.convertToViewportPoint(x1, y1);
    const [bx, by] = vp.convertToViewportPoint(x2, y2);
    return new DOMRect(box.left + Math.min(ax, bx), box.top + Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
  }

  // -------------------------------------------------------------------------------------------
  // Layers

  #attach(view: PageViewLike): void {
    let layers = this.#pages.get(view.id);
    if (!layers || layers.view !== view || !layers.marks.isConnected) {
      layers?.marks.remove();
      layers?.ink.remove();
      const marks = document.createElement("canvas");
      marks.className = "lumi-marks";
      const ink = document.createElement("div");
      ink.className = "lumi-ink";
      const inkCanvas = document.createElement("canvas");
      ink.append(inkCanvas);
      layers = { view, marks, ink, inkCanvas };
      this.#pages.set(view.id, layers);
    }
    // Marks sit right above the page image (below the text layer); ink goes on top.
    const wrapper = view.div.querySelector(".canvasWrapper");
    if (wrapper && layers.marks.previousElementSibling !== wrapper) wrapper.after(layers.marks);
    if (layers.ink.parentElement !== view.div || view.div.lastElementChild !== layers.ink) view.div.append(layers.ink);
    this.#draw(layers);
  }

  #sizeCanvas(canvas: HTMLCanvasElement, view: PageViewLike): CanvasRenderingContext2D {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(view.viewport.width * dpr);
    const h = Math.round(view.viewport.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.viewport.width, view.viewport.height);
    return ctx;
  }

  #draw(layers: PageLayers): void {
    const { view } = layers;
    const dark = isDarkActive();
    layers.marks.style.mixBlendMode = dark ? "screen" : "multiply";
    const marks = this.#sizeCanvas(layers.marks, view);
    const ink = this.#sizeCanvas(layers.inkCanvas, view);
    for (const pin of layers.ink.querySelectorAll(".lumi-note")) pin.remove();

    const list = annotations.onPage(view.id).filter((a) => !this.#erasing.has(a.id));
    for (const a of list) {
      switch (a.type) {
        case "marker":
          this.#stroke(marks, view, a, false);
          break;
        case "ink":
          this.#stroke(ink, view, a, false);
          break;
        case "highlight":
          marks.fillStyle = mapColor(a.color);
          for (const r of a.rects) this.#fillRect(marks, view, r, 0);
          break;
        case "underline":
        case "strike":
          ink.fillStyle = mapColor(deepen(a.color));
          for (const r of a.rects) this.#line(ink, view, r, a.type);
          break;
        case "note":
          this.#pin(layers, a.id, a.x, a.y, a.color, a.text);
          break;
      }
    }
    // Text marks that carry a comment get a small pin at their end.
    for (const a of list) {
      if ((a.type === "highlight" || a.type === "underline" || a.type === "strike") && a.note) {
        const last = a.rects[a.rects.length - 1]!;
        this.#pin(layers, a.id, last[2], last[3], a.color, a.note, true);
      }
    }
    const live = this.#live;
    if (live && live.page === view.id) {
      const style = this.cb.style();
      const stroke = {
        points: live.points,
        color: live.type === "ink" ? style.inkColor : style.markerColor,
        width: live.type === "ink" ? style.inkWidth : style.markerWidth,
        type: live.type,
      };
      this.#stroke(live.type === "ink" ? ink : marks, view, stroke, live.pressure);
    }
  }

  #stroke(ctx: CanvasRenderingContext2D, view: PageViewLike, a: Pick<Ink | Marker, "points" | "color" | "width" | "type">, realPressure: boolean): void {
    const vp = view.viewport;
    const pts: number[][] = [];
    for (let i = 0; i < a.points.length; i += 3) {
      const [x, y] = vp.convertToViewportPoint(a.points[i]!, a.points[i + 1]!);
      pts.push([x, y, a.points[i + 2]!]);
    }
    const size = a.width * vp.scale;
    const outline =
      a.type === "ink"
        ? getStroke(pts, { size: size * 1.6, thinning: 0.55, smoothing: 0.5, streamline: 0.45, simulatePressure: !realPressure && !hasPressure(a.points), last: true })
        : getStroke(pts, { size, thinning: 0, smoothing: 0.6, streamline: 0.5, simulatePressure: false, start: { cap: false }, end: { cap: false }, last: true });
    if (outline.length < 2) return;
    const path = new Path2D();
    path.moveTo(outline[0]![0]!, outline[0]![1]!);
    for (let i = 1; i < outline.length; i++) {
      const [x0, y0] = outline[i - 1]!;
      const [x1, y1] = outline[i]!;
      path.quadraticCurveTo(x0!, y0!, (x0! + x1!) / 2, (y0! + y1!) / 2);
    }
    path.closePath();
    ctx.fillStyle = mapColor(a.color);
    ctx.fill(path);
  }

  #fillRect(ctx: CanvasRenderingContext2D, view: PageViewLike, [x1, y1, x2, y2]: [number, number, number, number], pad: number): void {
    const [ax, ay] = view.viewport.convertToViewportPoint(x1, y1);
    const [bx, by] = view.viewport.convertToViewportPoint(x2, y2);
    const left = Math.min(ax, bx) - pad;
    const top = Math.min(ay, by) - pad;
    const w = Math.abs(bx - ax) + 2 * pad;
    const h = Math.abs(by - ay) + 2 * pad;
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, Math.min(3, h / 4));
    ctx.fill();
  }

  #line(ctx: CanvasRenderingContext2D, view: PageViewLike, [x1, y1, x2, y2]: [number, number, number, number], kind: "underline" | "strike"): void {
    const [ax, ay] = view.viewport.convertToViewportPoint(x1, y1);
    const [bx, by] = view.viewport.convertToViewportPoint(x2, y2);
    const left = Math.min(ax, bx);
    const top = Math.min(ay, by);
    const h = Math.abs(by - ay);
    const thickness = Math.max(1, h * 0.08);
    const y = kind === "underline" ? top + h * 0.94 : top + h * 0.55;
    ctx.fillRect(left, y - thickness / 2, Math.abs(bx - ax), thickness);
  }

  #pin(layers: PageLayers, id: string, x: number, y: number, color: string, text: string, small = false): void {
    const [vx, vy] = layers.view.viewport.convertToViewportPoint(x, y);
    const pin = document.createElement("button");
    pin.className = small ? "lumi-note small" : "lumi-note";
    pin.dataset.id = id;
    pin.style.left = `${vx}px`;
    pin.style.top = `${vy}px`;
    pin.style.setProperty("--note", color);
    pin.title = text.slice(0, 200);
    pin.setAttribute("aria-label", text ? text.slice(0, 80) : "Note");
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cb.onNoteOpen(id, pin);
    });
    layers.ink.append(pin);
  }

  // -------------------------------------------------------------------------------------------
  // Input

  #viewAt(clientX: number, clientY: number): PageViewLike | null {
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(".page[data-page-number]");
    if (!el || !this.controller.container.contains(el)) return null;
    return this.controller.pageView(Number(el.dataset.pageNumber));
  }

  #toPdf(view: PageViewLike, e: PointerEvent): [number, number] {
    const box = view.div.getBoundingClientRect();
    return view.viewport.convertToPdfPoint(e.clientX - box.left, e.clientY - box.top);
  }

  #onDown(e: PointerEvent): void {
    this.#down = { x: e.clientX, y: e.clientY, time: Date.now() };
    const tool = this.#tool;
    if (e.button !== 0 || !annotations.enabled) return;
    if (tool !== "pen" && tool !== "marker" && tool !== "eraser" && tool !== "note") return;
    if ((e.target as Element).closest(".lumi-note")) return; // clicking a pin opens it
    const view = this.#viewAt(e.clientX, e.clientY);
    if (!view) return;
    e.preventDefault();
    e.stopPropagation();
    const [x, y] = this.#toPdf(view, e);
    if (tool === "note") {
      const style = this.cb.style();
      const note: Annotation = { id: newId(), page: view.id, created: Date.now(), type: "note", color: style.noteColor, x, y, text: "" };
      annotations.add(note);
      this.redrawAll();
      const pin = this.#pages.get(view.id)?.ink.querySelector<HTMLElement>(`.lumi-note[data-id="${note.id}"]`);
      if (pin) this.cb.onNoteOpen(note.id, pin);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === "eraser") {
      this.#erasePage = view.id;
      this.#eraseAt(view, x, y);
      return;
    }
    const pressure = e.pointerType === "pen";
    this.#live = { page: view.id, type: tool === "pen" ? "ink" : "marker", points: [x, y, pressure ? e.pressure || 0.5 : 0.5], pressure, straight: e.shiftKey };
    this.#schedule(view.id);
  }

  #onMove(e: PointerEvent): void {
    if (this.#tool === "eraser" && this.#erasePage) {
      const view = this.controller.pageView(this.#erasePage);
      if (view && e.buttons & 1) {
        const [x, y] = this.#toPdf(view, e);
        this.#eraseAt(view, x, y);
      }
      return;
    }
    const live = this.#live;
    if (!live) return;
    e.preventDefault();
    const view = this.controller.pageView(live.page);
    if (!view) return;
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
    for (const ev of events.length ? events : [e]) {
      const [x, y] = this.#toPdf(view, ev);
      const p = live.pressure ? ev.pressure || 0.5 : 0.5;
      if (live.straight || e.shiftKey) {
        // Shift: a straight line from the first point.
        live.straight = true;
        live.points = [live.points[0]!, live.points[1]!, live.points[2]!, x, y, p];
      } else {
        live.points.push(x, y, p);
      }
    }
    this.#schedule(live.page);
  }

  #onUp(e: PointerEvent): void {
    const down = this.#down;
    this.#down = null;
    if (this.#erasePage) {
      this.#erasePage = 0;
      if (this.#erasing.size) annotations.remove(new Set(this.#erasing));
      this.#erasing.clear();
      return;
    }
    const live = this.#live;
    if (live) {
      this.#live = null;
      const view = this.controller.pageView(live.page);
      const step = view ? 0.6 / view.viewport.scale : 0.5;
      const style = this.cb.style();
      const points = thinPoints(live.points, step);
      // A single click with the pen leaves a dot; with the marker, nothing.
      if (points.length >= 6 || live.type === "ink") {
        const base = { id: newId(), page: live.page, created: Date.now(), points: points.length >= 6 ? points : [...points, points[0]! + 0.01, points[1]!, points[2]!] };
        annotations.add(
          live.type === "ink"
            ? { ...base, type: "ink", color: style.inkColor, width: style.inkWidth }
            : { ...base, type: "marker", color: style.markerColor, width: style.markerWidth },
        );
      } else {
        this.#schedule(live.page);
      }
      return;
    }
    // Select / highlight tools: text marks and clicks on existing marks.
    if (!down) return;
    if (this.#tool === "highlight") {
      const style = this.cb.style();
      if (this.markSelection(style.markKind, style.markColor).length) return;
    }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved <= CLICK_PX && (this.#tool === "select" || this.#tool === "highlight") && !this.selectionRect()) {
      const view = this.#viewAt(e.clientX, e.clientY);
      if (!view) return;
      const [x, y] = this.#toPdf(view, e);
      const tolerance = CLICK_PX / view.viewport.scale;
      const hit = [...annotations.onPage(view.id)].reverse().find((a) => (a.type === "highlight" || a.type === "underline" || a.type === "strike") && hits(a, x, y, tolerance));
      if (hit) this.cb.onMarkClick(hit.id, new DOMRect(e.clientX, e.clientY, 0, 0));
    }
  }

  #cancel(): void {
    this.#live = null;
    this.#erasePage = 0;
    this.#erasing.clear();
    this.redrawAll();
  }

  #eraseAt(view: PageViewLike, x: number, y: number): void {
    const tolerance = ERASER_PX / view.viewport.scale;
    let changed = false;
    for (const a of annotations.onPage(view.id)) {
      if (!this.#erasing.has(a.id) && hits(a, x, y, tolerance)) {
        this.#erasing.add(a.id);
        changed = true;
      }
    }
    if (changed) this.#schedule(view.id);
  }

  #schedule(page: number): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => {
      const layers = this.#pages.get(page);
      if (layers) this.#draw(layers);
    });
  }
}

/**
 * Highlighter colours are pale; as a thin line (underline, strike) they need more weight.
 * Mixes the colour 45% toward a dark tone of the same hue.
 */
export function deepen(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * 0.55);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function hasPressure(points: number[]): boolean {
  for (let i = 2; i < points.length; i += 3) if (points[i] !== 0.5) return true;
  return false;
}
