/**
 * The dark engine: recolours a PDF while pdf.js draws it, so the rasteriser itself produces
 * light-on-dark text and lines. Nothing is fixed up after rendering, which is what keeps dark
 * mode as crisp as the original.
 *
 * How it hooks into pdf.js (pinned version, see package.json):
 *  - Page canvases: before each page render we take the canvas's 2D context (pdf.js gets the
 *    very same object) and install colour mapping on it.
 *  - Scratch canvases (transparency groups, patterns, image scaling) come from our
 *    CanvasFactory, passed to getDocument, and get the same mapping.
 *  - Soft masks must keep their original lightness (it controls transparency), so contexts
 *    created for a soft-mask group are left untouched. We detect those groups by wrapping
 *    pdf.js's internal CanvasGraphics.beginGroup once at startup (see installPdfjsHooks).
 *
 * When dark mode is off the hooks pass everything through unchanged.
 */
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { pdfjs } from "../viewer/pdfjs";
import { createColorMapper, type ColorMapper } from "./mapper";
import { invalidateImage, prepareImage } from "./images";
import { getTheme, type DarkTuning, type ThemeId } from "./themes";

interface ActiveDark {
  mapper: ColorMapper;
  tuning: DarkTuning;
}

let active: ActiveDark | null = null;
const listeners = new Set<() => void>();

/** Turns dark mode on with a theme, or off with `null`. Listeners re-render the pages. */
export function setDarkMode(config: { theme: ThemeId; tuning: DarkTuning } | null): void {
  const next = config ? { mapper: createColorMapper(getTheme(config.theme), config.tuning), tuning: config.tuning } : null;
  const unchanged =
    (next === null && active === null) ||
    (next && active && next.mapper.key === active.mapper.key && JSON.stringify(next.tuning) === JSON.stringify(active.tuning));
  if (unchanged) return;
  active = next;
  for (const listener of listeners) listener();
}

export function onDarkModeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function darkBackground(): string | null {
  if (!active) return null;
  const [r, g, b] = active.mapper.background;
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------------------------------------------------------------------------------------------
// Context patching
// ---------------------------------------------------------------------------------------------

const patched = new WeakSet<CanvasRenderingContext2D>();
/** Contexts of soft-mask groups: never recoloured. */
const maskContexts = new WeakSet<CanvasRenderingContext2D>();
/** Canvases whose pixels came straight from decoded image data (putImageData). */
const rawCanvases = new WeakSet<object>();
let nextScratchIsMask = false;

const proto = CanvasRenderingContext2D.prototype;
const fillStyleProp = Object.getOwnPropertyDescriptor(proto, "fillStyle")!;
const strokeStyleProp = Object.getOwnPropertyDescriptor(proto, "strokeStyle")!;
const shadowColorProp = Object.getOwnPropertyDescriptor(proto, "shadowColor")!;

function mapping(ctx: CanvasRenderingContext2D): ActiveDark | null {
  return active && !maskContexts.has(ctx) ? active : null;
}

function isRawImage(source: CanvasImageSource): boolean {
  if (source instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas)) {
    return rawCanvases.has(source);
  }
  return true; // ImageBitmap, VideoFrame, HTMLImageElement: decoded image data
}

function wrapGradient(ctx: CanvasRenderingContext2D, gradient: CanvasGradient): CanvasGradient {
  const add = gradient.addColorStop.bind(gradient);
  gradient.addColorStop = (offset: number, color: string) => {
    const m = mapping(ctx);
    add(offset, m ? m.mapper.mapCss(color) : color);
  };
  return gradient;
}

/**
 * Rectangular clips are snapped to whole screen pixels. Slides are often built from strips,
 * each clipped to a rectangle that exactly touches the next one. Browsers soften each clip
 * edge separately, so two touching soft edges leave a faint hairline ("conflation").
 * Acrobat-class renderers snap such clips to the pixel grid; so do we. Applies in every mode.
 */
let snapRectClips = true;

/** For the test bench: compare renders with and without clip snapping. */
export function setClipSnapping(on: boolean): void {
  snapRectClips = on;
}

/** Axis-aligned rectangles among the paths pdf.js builds, keyed by its Path2D objects. */
const rectPaths = new WeakMap<Path2D, [number, number, number, number]>();

/** Returns [minX, minY, maxX, maxY] if pdf.js draw ops describe one axis-aligned rectangle. */
function rectFromDrawOps(ops: ArrayLike<number>): [number, number, number, number] | null {
  const MOVE = 0, LINE = 1, CLOSE = 4;
  const subpaths: number[][] = [];
  for (let i = 0; i < ops.length; ) {
    const op = ops[i++];
    if (op === MOVE) subpaths.push([ops[i++]!, ops[i++]!]);
    else if (op === LINE) subpaths.at(-1)?.push(ops[i++]!, ops[i++]!);
    else if (op === CLOSE) continue;
    else return null; // curves: not a rectangle
  }
  const real = subpaths.filter((p) => p.length >= 6); // ignore stray move-tos
  if (real.length !== 1) return null;
  const pts = real[0]!;
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (let i = 0; i < pts.length; i += 2) {
    xs.add(pts[i]!);
    ys.add(pts[i + 1]!);
  }
  if (xs.size !== 2 || ys.size !== 2 || pts.length > 10) return null;
  const [x0, x1] = [...xs].sort((a, b) => a - b) as [number, number];
  const [y0, y1] = [...ys].sort((a, b) => a - b) as [number, number];
  return [x0, y0, x1, y1];
}

/** Builds a Path2D from pdf.js draw ops, exactly like pdf.js's own makePathFromDrawOPS. */
function pathFromDrawOps(ops: ArrayLike<number>): Path2D {
  const path = new Path2D();
  for (let i = 0; i < ops.length; ) {
    switch (ops[i++]) {
      case 0:
        path.moveTo(ops[i++]!, ops[i++]!);
        break;
      case 1:
        path.lineTo(ops[i++]!, ops[i++]!);
        break;
      case 2:
        path.bezierCurveTo(ops[i++]!, ops[i++]!, ops[i++]!, ops[i++]!, ops[i++]!, ops[i++]!);
        break;
      case 3:
        path.quadraticCurveTo(ops[i++]!, ops[i++]!, ops[i++]!, ops[i++]!);
        break;
      case 4:
        path.closePath();
        break;
    }
  }
  return path;
}

/** The same rectangle, with its screen-space edges rounded to whole pixels. */
function snappedClip(ctx: CanvasRenderingContext2D, rect: [number, number, number, number]): Path2D | null {
  const t = ctx.getTransform();
  const axisAligned = (t.b === 0 && t.c === 0) || (t.a === 0 && t.d === 0);
  if (!axisAligned) return null;
  const p0 = t.transformPoint({ x: rect[0], y: rect[1] });
  const p1 = t.transformPoint({ x: rect[2], y: rect[3] });
  const left = Math.round(Math.min(p0.x, p1.x));
  const right = Math.round(Math.max(p0.x, p1.x));
  const top = Math.round(Math.min(p0.y, p1.y));
  const bottom = Math.round(Math.max(p0.y, p1.y));
  const inv = t.inverse();
  const a = inv.transformPoint({ x: left, y: top });
  const b = inv.transformPoint({ x: right, y: bottom });
  const path = new Path2D();
  path.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return path;
}

export function patchContext(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  if (patched.has(ctx)) return ctx;
  patched.add(ctx);

  for (const prop of [fillStyleProp, strokeStyleProp, shadowColorProp]) {
    Object.defineProperty(ctx, prop === fillStyleProp ? "fillStyle" : prop === strokeStyleProp ? "strokeStyle" : "shadowColor", {
      configurable: true,
      get: () => prop.get!.call(ctx),
      set: (value: unknown) => {
        const m = mapping(ctx);
        prop.set!.call(ctx, m && typeof value === "string" ? m.mapper.mapCss(value) : value);
      },
    });
  }

  const { createLinearGradient, createRadialGradient, fillText, drawImage, putImageData, createPattern, clip } = proto;

  ctx.clip = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    const path = args[0];
    if (snapRectClips && path instanceof Path2D) {
      const rect = rectPaths.get(path);
      const snapped = rect && snappedClip(ctx, rect);
      if (snapped) {
        args[0] = snapped;
        args[1] = "nonzero"; // a single rectangle fills the same area under either rule
      }
    }
    (clip as (...a: unknown[]) => void).apply(ctx, args);
  } as typeof ctx.clip;
  ctx.createLinearGradient = (...args) => wrapGradient(ctx, createLinearGradient.apply(ctx, args));
  ctx.createRadialGradient = (...args) => wrapGradient(ctx, createRadialGradient.apply(ctx, args));

  // Light text on a dark page looks thinner than dark text on white; a hairline outline in the
  // same colour restores the original visual weight.
  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    maxWidth === undefined ? fillText.call(ctx, text, x, y) : fillText.call(ctx, text, x, y, maxWidth);
    const m = mapping(ctx);
    if (!m || m.tuning.textWeight <= 0) return;
    const t = ctx.getTransform();
    const scale = Math.hypot(t.a, t.b) || 1;
    const { lineWidth, lineJoin } = ctx;
    const stroke = strokeStyleProp.get!.call(ctx);
    strokeStyleProp.set!.call(ctx, fillStyleProp.get!.call(ctx));
    ctx.lineWidth = m.tuning.textWeight / scale;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = lineJoin;
    strokeStyleProp.set!.call(ctx, stroke);
  };

  ctx.drawImage = function (this: CanvasRenderingContext2D, image: CanvasImageSource, ...rest: number[]) {
    const m = mapping(ctx);
    let source = image;
    if (m && isRawImage(image)) source = prepareImage(image, m.mapper, m.tuning.dimPhotos).source;
    (drawImage as (...a: unknown[]) => void).call(ctx, source, ...rest);
  } as typeof ctx.drawImage;

  ctx.putImageData = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    rawCanvases.add(ctx.canvas);
    invalidateImage(ctx.canvas);
    (putImageData as (...a: unknown[]) => void).apply(ctx, args);
  } as typeof ctx.putImageData;

  // Mesh shadings (complex gradients) are computed as raw pixels and used as a pattern.
  ctx.createPattern = (image: CanvasImageSource, repetition: string | null) => {
    const m = mapping(ctx);
    if (m && (image instanceof HTMLCanvasElement) && rawCanvases.has(image)) {
      const copy = document.createElement("canvas");
      copy.width = image.width;
      copy.height = image.height;
      const c = copy.getContext("2d", { willReadFrequently: true })!;
      c.drawImage(image, 0, 0);
      const px = c.getImageData(0, 0, copy.width, copy.height);
      m.mapper.mapPixels(px.data);
      c.putImageData(px, 0, 0);
      return createPattern.call(ctx, copy, repetition);
    }
    return createPattern.call(ctx, image, repetition);
  };

  return ctx;
}

// ---------------------------------------------------------------------------------------------
// pdf.js integration
// ---------------------------------------------------------------------------------------------

/** Canvas factory handed to pdf.js: every scratch canvas gets the colour mapping. */
export class RecolorCanvasFactory {
  #document: Document;
  #enableHWA: boolean;

  constructor({ ownerDocument = globalThis.document, enableHWA = false }: { ownerDocument?: Document; enableHWA?: boolean } = {}) {
    this.#document = ownerDocument;
    this.#enableHWA = enableHWA;
  }

  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    const canvas = this.#document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = patchContext(canvas.getContext("2d", { willReadFrequently: !this.#enableHWA })!);
    if (nextScratchIsMask) {
      maskContexts.add(context);
      nextScratchIsMask = false;
    }
    return { canvas, context };
  }

  reset(entry: { canvas: HTMLCanvasElement | null }, width: number, height: number) {
    if (!entry.canvas) throw new Error("Canvas is not specified");
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    entry.canvas.width = width;
    entry.canvas.height = height;
  }

  destroy(entry: { canvas: HTMLCanvasElement | null; context: CanvasRenderingContext2D | null }) {
    if (!entry.canvas) throw new Error("Canvas is not specified");
    entry.canvas.width = 0;
    entry.canvas.height = 0;
    entry.canvas = null;
    entry.context = null;
  }
}

const wrappedPages = new WeakSet<PDFPageProxy>();

function wrapPage(page: PDFPageProxy): void {
  if (wrappedPages.has(page)) return;
  wrappedPages.add(page);
  const render = page.render.bind(page);
  page.render = (params) => {
    const canvas = params.canvas;
    if (canvas) {
      // Same options pdf.js uses (render task, enableHWA off), so it receives this same context.
      patchContext(canvas.getContext("2d", { alpha: false, willReadFrequently: true })!);
    }
    return render(params);
  };
}

/** Makes every page of `doc` render through the dark engine. */
export function attachToDocument(doc: PDFDocumentProxy): void {
  const getPage = doc.getPage.bind(doc);
  doc.getPage = async (pageNumber: number) => {
    const page = await getPage(pageNumber);
    wrapPage(page);
    return page;
  };
}

// A one-page PDF with a single filled square, used once to reach pdf.js's internal renderer.
const WARMUP_PDF =
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 4 4]/Contents 4 0 R>>endobj\n" +
  "4 0 obj<</Length 18>>stream\n0 0 1 rg 0 0 4 4 re f\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

let hooksInstalled: Promise<boolean> | null = null;

/**
 * pdf.js dispatches drawing operators through numeric aliases of its methods (copied when the
 * module loads), so every property holding the original function must be replaced, not just
 * the named one.
 */
function replaceMethod(target: object, original: unknown, replacement: (...a: unknown[]) => unknown): void {
  const record = target as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor && "value" in descriptor && descriptor.value === original) record[key] = replacement;
  }
}

/**
 * Wraps pdf.js's CanvasGraphics.beginGroup so soft-mask groups are drawn without recolouring.
 * CanvasGraphics is internal to pdf.js; we reach it through one tiny render. Resolves to false
 * (and dark mode still works, except for soft-masked content) if pdf.js changed internally.
 */
export function installPdfjsHooks(): Promise<boolean> {
  hooksInstalled ??= (async () => {
    const task = pdfjs.getDocument({ data: new TextEncoder().encode(WARMUP_PDF), CanvasFactory: RecolorCanvasFactory });
    try {
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 4;
      const renderTask = page.render({ canvas, viewport: page.getViewport({ scale: 1 }) });
      await renderTask.promise;
      const gfx = (renderTask as unknown as { _internalRenderTask?: { gfx?: object } })._internalRenderTask?.gfx;
      const graphicsProto = gfx
        ? (Object.getPrototypeOf(gfx) as { beginGroup?: (...a: unknown[]) => unknown; constructPath?: (...a: unknown[]) => unknown })
        : null;
      const beginGroup = graphicsProto?.beginGroup;
      const constructPath = graphicsProto?.constructPath;
      if (!graphicsProto || typeof beginGroup !== "function" || typeof constructPath !== "function") {
        console.warn("LumiPDF: pdf.js internals changed; soft masks will be recoloured in dark mode.");
        return false;
      }
      replaceMethod(graphicsProto, beginGroup, function (this: unknown, ...args: unknown[]) {
        const group = args[1] as { smask?: unknown } | undefined;
        nextScratchIsMask = Boolean(group?.smask);
        try {
          return beginGroup.apply(this, args);
        } finally {
          nextScratchIsMask = false;
        }
      });
      // pdf.js turns a path's draw ops into a Path2D the first time it draws it (and keeps it
      // for later renders). For plain rectangles we build that Path2D ourselves and remember it,
      // so clips that use exactly this path can be pixel-snapped.
      replaceMethod(graphicsProto, constructPath, function (this: unknown, ...args: unknown[]) {
        const data = args[2] as unknown[] | undefined;
        const ops = data?.[0];
        if (args[3] && ops && !(ops instanceof Path2D) && typeof (ops as ArrayLike<number>).length === "number") {
          const rect = rectFromDrawOps(ops as ArrayLike<number>);
          if (rect) {
            const path = pathFromDrawOps(ops as ArrayLike<number>);
            rectPaths.set(path, rect);
            data[0] = path;
          }
        }
        return constructPath.apply(this, args);
      });
      return true;
    } finally {
      await task.destroy();
    }
  })();
  return hooksInstalled;
}
