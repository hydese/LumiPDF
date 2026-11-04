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
import type { PDFPageProxy } from "pdfjs-dist";
import { isDarkActive, mapColor, onDarkModeChange } from "../dark/engine";
import type { PageViewLike, ViewerController } from "../viewer/ViewerController";
import { PALETTE, hits, mergeLineRects, newId, thinPoints, type Annotation, type Ink, type Marker, type MarkKind, type TextMark } from "./model";
import { annotations, type Tool } from "./store.svelte";

export interface LayerCallbacks {
  /** A sticky note pin was clicked (or a note was just placed). */
  onNoteOpen: (id: string, anchor: HTMLElement) => void;
  /** A text mark was clicked in select mode. */
  onMarkClick: (id: string, at: DOMRect) => void;
  /** An area was snipped (screen rectangle), and when a new snip starts. */
  onSnip?: (at: DOMRect) => void;
  onSnipClear?: () => void;
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

const PRESETS = new Set<string>([...PALETTE.ink, ...PALETTE.marker, ...PALETTE.note, ...PALETTE.ink.map(deepenPreset), ...PALETTE.marker.map(deepenPreset)]);
function deepenPreset(hex: string): string {
  return deepen(hex).toLowerCase();
}

export class AnnotationLayer {
  #pages = new Map<number, PageLayers>();
  #live: LiveStroke | null = null;
  #erasing = new Set<string>();
  #erasePage = 0;
  #frame = 0;
  #down: { x: number; y: number; time: number } | null = null;
  #cleanups: Array<() => void> = [];
  #tool: Tool = "select";
  /** While true, annotations are painted in their original colours (white-paper renders). */
  #plain = false;
  /** Hand tool: the drag in progress. */
  #pan: { x: number; y: number; left: number; top: number; id: number } | null = null;

  constructor(
    private readonly controller: ViewerController,
    private readonly cb: LayerCallbacks,
  ) {
    this.#cleanups.push(controller.onPageRendered((view) => this.#attach(view)));
    this.#cleanups.push(onDarkModeChange(() => this.redrawAll()));
    // Layers only cover the visible part of each page (so zooming in never makes huge canvases);
    // scrolling moves that window.
    let scrollFrame = 0;
    const onScroll = () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => this.redrawAll());
    };
    controller.container.addEventListener("scroll", onScroll, { passive: true });
    // After a zoom the layers follow the new page size right away (pdf.js redraws pages later).
    this.#cleanups.push(controller.onScaleChanged(onScroll));
    this.#cleanups.push(() => {
      cancelAnimationFrame(scrollFrame);
      controller.container.removeEventListener("scroll", onScroll);
    });
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
    c.classList.toggle("tool-draw", tool === "pen" || tool === "marker" || tool === "eraser" || tool === "note" || tool === "snip");
    if (tool !== "snip") this.clearSnip();
    c.dataset.tool = tool;
  }

  destroy(): void {
    cancelAnimationFrame(this.#frame);
    this.#snipBox?.remove();
    this.#snipDim?.remove();
    for (const off of this.#cleanups) off();
    for (const p of this.#pages.values()) {
      p.marks.remove();
      p.ink.remove();
    }
    this.#pages.clear();
    this.#snipBox?.remove();
    this.#snipDim?.remove();
  }

  /** Redraws every page that has layers (after annotations or the theme change). */
  redrawAll(): void {
    this.#placeSnip();
    this.#attachRendered();
    for (const [page, layers] of this.#pages) {
      if (!layers.view.div.isConnected) this.#pages.delete(page);
      else if (!layers.marks.isConnected || !layers.ink.isConnected) this.#attach(layers.view);
      else this.#draw(layers);
    }
  }

  /**
   * Puts layers on pages that are already drawn but have none: pdf.js can drop our layers when
   * it resets a page (zoom), and a tab coming back shows its pages without drawing them again.
   */
  #attachRendered(): void {
    const box = this.controller.container.getBoundingClientRect();
    for (const div of this.controller.container.querySelectorAll<HTMLElement>(".page[data-page-number]")) {
      const page = Number(div.dataset.pageNumber);
      if (this.#pages.get(page)?.marks.isConnected) continue;
      if (!div.querySelector(".canvasWrapper canvas")) continue;
      const r = div.getBoundingClientRect();
      if (r.bottom < box.top - 400 || r.top > box.bottom + 400) continue;
      const view = this.controller.pageView(page);
      if (view?.div === div) this.#attach(view);
    }
  }

  /** Forget layers (new document); pages already drawn get fresh ones. */
  reset(): void {
    for (const p of this.#pages.values()) {
      p.marks.remove();
      p.ink.remove();
    }
    this.#pages.clear();
    this.#attachRendered();
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

  /** The part of the page on screen (plus a margin for smooth scrolling), in page pixels. */
  #region(view: PageViewLike): { left: number; top: number; width: number; height: number } {
    const page = view.div.getBoundingClientRect();
    const box = this.controller.container.getBoundingClientRect();
    const margin = Math.min(400, box.height / 2);
    const left = Math.max(0, box.left - margin - page.left);
    const top = Math.max(0, box.top - margin - page.top);
    const right = Math.min(view.viewport.width, box.right + margin - page.left);
    const bottom = Math.min(view.viewport.height, box.bottom + margin - page.top);
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  #sizeCanvas(canvas: HTMLCanvasElement, region: { left: number; top: number; width: number; height: number }): CanvasRenderingContext2D {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(region.width * dpr);
    const h = Math.round(region.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    Object.assign(canvas.style, { left: `${region.left}px`, top: `${region.top}px`, width: `${region.width}px`, height: `${region.height}px` });
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, -region.left * dpr, -region.top * dpr);
    return ctx;
  }

  #draw(layers: PageLayers): void {
    const { view } = layers;
    layers.marks.style.mixBlendMode = isDarkActive() ? "screen" : "multiply";
    const region = this.#region(view);
    const marks = this.#sizeCanvas(layers.marks, region);
    const ink = this.#sizeCanvas(layers.inkCanvas, region);
    for (const pin of layers.ink.querySelectorAll(".lumi-note")) pin.remove();

    const list = annotations.onPage(view.id).filter((a) => !this.#erasing.has(a.id));
    this.#paint(marks, view, list, "marks");
    this.#paint(ink, view, list, "ink");
    for (const a of list) {
      if (a.type === "note") this.#pin(layers, a.id, a.x, a.y, a.color, a.text);
      // Text marks that carry a comment get a small pin at their end.
      else if ((a.type === "highlight" || a.type === "underline" || a.type === "strike") && a.note) {
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

  /**
   * Paints one of the two passes: "marks" (highlighter and highlights, blended under the text)
   * or "ink" (pen, underline, strike-through, on top).
   */
  #paint(ctx: CanvasRenderingContext2D, view: PageViewLike, list: Annotation[], pass: "marks" | "ink"): void {
    for (const a of list) {
      if (pass === "marks") {
        if (a.type === "marker") this.#stroke(ctx, view, a, false);
        else if (a.type === "highlight") {
          ctx.fillStyle = this.#color(a.color);
          for (const r of a.rects) this.#fillRect(ctx, view, r, 0);
        }
      } else if (a.type === "ink") {
        this.#stroke(ctx, view, a, false);
      } else if (a.type === "underline" || a.type === "strike") {
        ctx.fillStyle = this.#color(deepen(a.color));
        for (const r of a.rects) this.#line(ctx, view, r, a.type);
      }
    }
  }

  /**
   * Draws a page area as a picture, the way it looks now (theme, annotations), at `scale` times
   * the on-screen size. `rect` is in page pixels of the current zoom.
   */
  async renderRegion(
    page: number,
    rect: { left: number; top: number; width: number; height: number },
    scale: number,
    /** Draw on white paper with the original colours, from this page of an unhooked document. */
    light?: PDFPageProxy,
  ): Promise<HTMLCanvasElement | null> {
    const doc = this.controller.document;
    const view = this.controller.pageView(page);
    if (!doc || !view) return null;
    const pdfPage = light ?? (await doc.getPage(page));
    const vp = view.viewport as unknown as { scale: number; rotation: number };
    const viewport = pdfPage.getViewport({ scale: vp.scale * scale, rotation: vp.rotation });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    // White paper: in dark mode the engine turns it into the theme background, like the page.
    await pdfPage.render({ canvas, viewport, background: "#ffffff", transform: [1, 0, 0, 1, -rect.left * scale, -rect.top * scale] }).promise;
    const ctx = canvas.getContext("2d")!;
    const fake: PageViewLike = { id: page, div: view.div, viewport: viewport as unknown as PageViewLike["viewport"] };
    const list = annotations.onPage(page);
    ctx.setTransform(1, 0, 0, 1, -rect.left * scale, -rect.top * scale);
    this.#plain = Boolean(light);
    try {
      ctx.globalCompositeOperation = isDarkActive() && !light ? "screen" : "multiply";
      this.#paint(ctx, fake, list, "marks");
      ctx.globalCompositeOperation = "source-over";
      this.#paint(ctx, fake, list, "ink");
    } finally {
      this.#plain = false;
    }
    return canvas;
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
    ctx.fillStyle = this.#color(a.color);
    ctx.fill(path);
  }

  /**
   * Preset colours are adapted to dark pages (dark ink becomes light, and so on). A custom colour
   * is drawn exactly as picked: you chose it while looking at the page.
   */
  #color(css: string): string {
    return this.#plain || !PRESETS.has(css.toLowerCase()) ? css : mapColor(css);
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
    let drag: { x: number; y: number; moved: boolean } | null = null;
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pin.dataset.dragged) {
        delete pin.dataset.dragged;
        return;
      }
      this.cb.onNoteOpen(id, pin);
    });
    if (!small) {
      // Sticky notes can be dragged anywhere on their page.
      pin.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        pin.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, moved: false };
      });
      pin.addEventListener("pointermove", (e) => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
        drag.moved = true;
        pin.classList.add("dragging");
        const box = layers.view.div.getBoundingClientRect();
        pin.style.left = `${Math.min(Math.max(0, e.clientX - box.left), box.width)}px`;
        pin.style.top = `${Math.min(Math.max(0, e.clientY - box.top), box.height)}px`;
      });
      pin.addEventListener("pointerup", (e) => {
        if (!drag) return;
        e.stopPropagation();
        const moved = drag.moved;
        drag = null;
        pin.classList.remove("dragging");
        if (!moved) return;
        pin.dataset.dragged = "1";
        const [nx, ny] = layers.view.viewport.convertToPdfPoint(Number.parseFloat(pin.style.left), Number.parseFloat(pin.style.top));
        annotations.update(id, { x: nx, y: ny });
      });
    }
    layers.ink.append(pin);
  }

  // -------------------------------------------------------------------------------------------
  // Snip (screenshot of an area)

  #snip: { page: number; x0: number; y0: number; x1: number; y1: number; done: boolean } | null = null;
  #snipBox: HTMLDivElement | null = null;
  #snipDim: HTMLDivElement | null = null;

  /** The snip rectangle in page pixels, normalised. */
  #snipRect(): { left: number; top: number; width: number; height: number } | null {
    const s = this.#snip;
    if (!s) return null;
    return { left: Math.min(s.x0, s.x1), top: Math.min(s.y0, s.y1), width: Math.abs(s.x1 - s.x0), height: Math.abs(s.y1 - s.y0) };
  }

  /**
   * The snip rectangle lives in its own fixed layer above everything (not inside the page, which
   * pdf.js may rebuild while you drag), positioned from the page's place on screen.
   */
  #placeSnip(): void {
    const rect = this.#snipRect();
    const view = this.#snip ? this.controller.pageView(this.#snip.page) : null;
    if (!rect || !view?.div.isConnected) {
      this.#snipBox?.remove();
    this.#snipDim?.remove();
      return;
    }
    if (!this.#snipBox) {
      const box = document.createElement("div");
      box.className = "lumi-snip";
      Object.assign(box.style, {
        position: "fixed",
        zIndex: "40",
        pointerEvents: "none",
        boxSizing: "border-box",
        border: "1.5px dashed var(--accent)",
        borderRadius: "3px",
        background: "rgba(61, 107, 240, 0.08)",
      });
      this.#snipBox = box;
      // Dims the reading area around the selection: one layer with a hole cut out (a huge
      // box-shadow does the same but doesn't always get painted).
      const dim = document.createElement("div");
      dim.className = "lumi-snip-dim";
      Object.assign(dim.style, { position: "fixed", zIndex: "39", pointerEvents: "none", background: "rgba(0, 0, 0, 0.18)" });
      this.#snipDim = dim;
    }
    const page = view.div.getBoundingClientRect();
    Object.assign(this.#snipBox.style, {
      left: `${page.left + rect.left}px`,
      top: `${page.top + rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    const area = this.controller.container.getBoundingClientRect();
    const x = page.left + rect.left - area.left;
    const y = page.top + rect.top - area.top;
    Object.assign(this.#snipDim!.style, {
      left: `${area.left}px`,
      top: `${area.top}px`,
      width: `${area.width}px`,
      height: `${area.height}px`,
      clipPath: `path(evenodd, "M0 0H${area.width}V${area.height}H0Z M${x} ${y}h${rect.width}v${rect.height}h${-rect.width}Z")`,
    });
    if (!this.#snipDim!.isConnected) document.body.append(this.#snipDim!);
    if (!this.#snipBox.isConnected) document.body.append(this.#snipBox);
  }

  /** Where the finished snip is on screen now (it moves with scrolling). */
  snipScreenRect(): DOMRect | null {
    return this.#snipBox?.isConnected ? this.#snipBox.getBoundingClientRect() : null;
  }

  /** Removes the snip rectangle (after copying/saving, or when the menu closes). */
  clearSnip(): void {
    this.#snip = null;
    this.#snipBox?.remove();
    this.#snipDim?.remove();
  }

  /** Renders the snipped area at `scale` × its on-screen size (`light`: on white paper). */
  async renderSnip(scale: number, light?: (page: number) => Promise<PDFPageProxy>): Promise<HTMLCanvasElement | null> {
    const rect = this.#snipRect();
    const snip = this.#snip;
    if (!snip || !rect) return null;
    return this.renderRegion(snip.page, rect, scale, light ? await light(snip.page) : undefined);
  }

  /** The snipped area: its page and its size in PDF points. */
  snipArea(): { page: number; width: number; height: number } | null {
    const rect = this.#snipRect();
    const view = this.#snip ? this.controller.pageView(this.#snip.page) : null;
    if (!rect || !view) return null;
    const scale = (view.viewport as unknown as { scale: number }).scale;
    return { page: this.#snip!.page, width: rect.width / scale, height: rect.height / scale };
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
    if (tool === "hand") {
      // Hand: drag to scroll. Links, notes and buttons still work with a click.
      if (e.button !== 0 || (e.target as Element).closest("a, button, .lumi-note, input, textarea")) return;
      const c = this.controller.container;
      this.#pan = { x: e.clientX, y: e.clientY, left: c.scrollLeft, top: c.scrollTop, id: e.pointerId };
      c.setPointerCapture?.(e.pointerId);
      c.classList.add("panning");
      e.preventDefault();
      return;
    }
    if (e.button !== 0 || !annotations.enabled) return;
    if (tool !== "pen" && tool !== "marker" && tool !== "eraser" && tool !== "note" && tool !== "snip") return;
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
    if (tool === "snip") {
      const box = view.div.getBoundingClientRect();
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
      this.cb.onSnipClear?.();
      this.#snip = { page: view.id, x0: px, y0: py, x1: px, y1: py, done: false };
      this.#placeSnip();
      return;
    }
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
    const pan = this.#pan;
    if (pan && e.pointerId === pan.id) {
      const c = this.controller.container;
      c.scrollLeft = pan.left - (e.clientX - pan.x);
      c.scrollTop = pan.top - (e.clientY - pan.y);
      return;
    }
    const snip = this.#snip;
    if (snip && !snip.done && this.#tool === "snip") {
      const view = this.controller.pageView(snip.page);
      if (!view) return;
      const box = view.div.getBoundingClientRect();
      snip.x1 = Math.min(Math.max(0, e.clientX - box.left), box.width);
      snip.y1 = Math.min(Math.max(0, e.clientY - box.top), box.height);
      this.#placeSnip();
      return;
    }
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
    if (this.#pan && e.pointerId === this.#pan.id) {
      this.#pan = null;
      this.controller.container.classList.remove("panning");
      return;
    }
    const down = this.#down;
    this.#down = null;
    const snip = this.#snip;
    if (snip && !snip.done && this.#tool === "snip") {
      const rect = this.#snipRect()!;
      if (rect.width < 6 || rect.height < 6) {
        this.clearSnip();
        return;
      }
      snip.done = true;
      const view = this.controller.pageView(snip.page)!;
      const box = view.div.getBoundingClientRect();
      this.cb.onSnip?.(new DOMRect(box.left + rect.left, box.top + rect.top, rect.width, rect.height));
      return;
    }
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
      // Sticky notes are never erased by accident: they're deleted from their own editor.
      if (a.type !== "note" && !this.#erasing.has(a.id) && hits(a, x, y, tolerance)) {
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
