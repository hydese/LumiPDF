/**
 * Image path of the dark engine. Images in a PDF are "paper" (scans, handwritten notes,
 * screenshots of documents: mostly light background), "graphic" (raster charts and diagrams:
 * a few flat colours) or photos. Paper and graphics are recoloured once at their own resolution,
 * then drawn by pdf.js as usual, so they stay as sharp as the original. Photos keep their
 * colours, optionally a little dimmed.
 */
import type { ColorMapper } from "./mapper";

export type ImageKind = "paper" | "graphic" | "photo";

export interface Analysis {
  kind: ImageKind;
  opaque: boolean;
}

export interface Prepared {
  source: CanvasImageSource;
  opaque: boolean;
}

/**
 * Share of light pixels from which an image counts as paper. "Light" allows some tint, so pale
 * slide gradients and tinted scans count as paper; photos rarely have this many light pixels.
 */
const PAPER_RATIO = 0.45;
const LIGHT_MIN_CHANNEL = 175;
const LIGHT_MAX_SPREAD = 70;
const SAMPLE_SIZE = 64;
/** Images above this size are drawn unchanged rather than copied (memory guard). */
const MAX_RECOLOR_PIXELS = 40_000_000;
/** Total memory for recoloured copies kept between renders. */
const CACHE_BUDGET_BYTES = 192 * 1024 * 1024;
/**
 * Graphics (raster charts, diagrams, screenshots of slides) are made of a few flat colours;
 * photos spread over many. An image whose most common colours cover this share of it is a
 * graphic and gets recoloured even when it isn't mostly white.
 */
const GRAPHIC_TOP_COLORS = 8;
const GRAPHIC_COVERAGE = 0.7;
/** How much photos are darkened when dimming is on. */
const PHOTO_DIM = 0.12;

interface CacheEntry {
  key: string;
  prepared: Prepared;
  bytes: number;
}

const cache = new WeakMap<object, CacheEntry>();
const cacheOrder: Array<{ source: WeakRef<object>; entry: CacheEntry }> = [];
let cacheBytes = 0;

export function imageSize(source: CanvasImageSource): { width: number; height: number } {
  const s = source as { width?: number; height?: number; displayWidth?: number; displayHeight?: number; naturalWidth?: number; naturalHeight?: number };
  return {
    width: s.naturalWidth || s.displayWidth || s.width || 0,
    height: s.naturalHeight || s.displayHeight || s.height || 0,
  };
}

function analyze(source: CanvasImageSource, width: number, height: number): Analysis {
  const w = Math.min(SAMPLE_SIZE, width);
  const h = Math.min(SAMPLE_SIZE, height);
  const sample = document.createElement("canvas");
  sample.width = w;
  sample.height = h;
  const ctx = sample.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, width, height, 0, 0, w, h);
  return classifyPixels(ctx.getImageData(0, 0, w, h).data);
}

/**
 * Pixels with at least this much colour (max − min channel) are "colourful". A picture with a
 * real share of them (a logo, an illustration, a portrait, pixel art) keeps its colours: the
 * reader looks at it, and recolouring it the way paper is recoloured made whites black and
 * shifted every hue. Scans and charts have almost none (a coloured line here and there).
 */
const COLORFUL_SPREAD = 48;
const PICTURE_COLORFUL_SHARE = 0.1;
/** Paper is light background and dark ink; a page full of mid-tones is an engraving or a photo. */
const MID_MIN = 70;
const MID_MAX = 175;
const PAPER_MAX_MIDTONES = 0.3;

/** What kind of image these RGBA pixels (a small sample of it) are. Exported for tests. */
export function classifyPixels(data: Uint8ClampedArray): Analysis {
  let light = 0;
  let colorful = 0;
  let mid = 0;
  let opaque = true;
  let counted = 0;
  const bins = new Map<number, number>(); // colours quantised to 4 bits per channel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 255) opaque = false;
    if (a === 0) continue;
    counted++;
    const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const spread = max - min;
    if (spread >= COLORFUL_SPREAD) colorful++;
    else if (min > LIGHT_MIN_CHANNEL && spread < LIGHT_MAX_SPREAD) light++;
    const lum = (r * 3 + g * 6 + b) / 10;
    if (lum >= MID_MIN && lum <= MID_MAX) mid++;
  }
  if (counted === 0) return { kind: "paper", opaque };
  if (colorful / counted >= PICTURE_COLORFUL_SHARE) return { kind: "photo", opaque };
  if (light / counted >= PAPER_RATIO && mid / counted <= PAPER_MAX_MIDTONES) return { kind: "paper", opaque };
  const top = [...bins.values()].sort((x, y) => y - x).slice(0, GRAPHIC_TOP_COLORS);
  const coverage = top.reduce((sum, n) => sum + n, 0) / counted;
  return { kind: coverage >= GRAPHIC_COVERAGE ? "graphic" : "photo", opaque };
}

/**
 * Scans: paper isn't pure white and ink isn't pure black, and the grey noise around letters
 * (scanner blur, JPEG) became a glow on dark pages. Grey pixels are stretched so near-white
 * becomes white (background) and near-black becomes black (text); coloured pixels are left alone.
 * Exported for tests.
 */
export function cleanScan(data: Uint8ClampedArray): void {
  const lo = SCAN_BLACK;
  const span = SCAN_WHITE - SCAN_BLACK;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    if (Math.max(r, g, b) - Math.min(r, g, b) >= COLORFUL_SPREAD) continue;
    data[i] = ((r - lo) * 255) / span;
    data[i + 1] = ((g - lo) * 255) / span;
    data[i + 2] = ((b - lo) * 255) / span;
  }
}
const SCAN_BLACK = 50;
const SCAN_WHITE = 215;

function recolor(source: CanvasImageSource, width: number, height: number, mapper: ColorMapper, scan: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);
  if (scan) cleanScan(pixels.data);
  mapper.mapPixels(pixels.data);
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

function dim(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = `rgba(0, 0, 0, ${PHOTO_DIM})`;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function remember(source: object, entry: CacheEntry): void {
  cache.set(source, entry);
  cacheOrder.push({ source: new WeakRef(source), entry });
  cacheBytes += entry.bytes;
  while (cacheBytes > CACHE_BUDGET_BYTES && cacheOrder.length > 1) {
    const oldest = cacheOrder.shift()!;
    cacheBytes -= oldest.entry.bytes;
    const key = oldest.source.deref();
    if (key && cache.get(key) === oldest.entry) cache.delete(key);
  }
}

/** Forget a source whose pixels changed (pdf.js reuses scratch canvases for other images). */
export function invalidateImage(source: object): void {
  cache.delete(source);
}

/** Returns what to draw instead of `source` in dark mode, and whether it is fully opaque. */
export function prepareImage(source: CanvasImageSource, mapper: ColorMapper, dimPhotos: boolean): Prepared {
  const { width, height } = imageSize(source);
  if (width < 2 || height < 2) return { source, opaque: false };
  const key = `${mapper.key}|${dimPhotos}`;
  const cached = cache.get(source as object);
  if (cached?.key === key) return cached.prepared;

  const { kind, opaque } = analyze(source, width, height);
  let prepared: Prepared = { source, opaque };
  if (width * height <= MAX_RECOLOR_PIXELS) {
    if (kind === "paper" || kind === "graphic") prepared = { source: recolor(source, width, height, mapper, kind === "paper"), opaque };
    else if (dimPhotos) prepared = { source: dim(source, width, height), opaque };
  }
  const bytes = prepared.source === source ? 0 : width * height * 4;
  remember(source as object, { key, prepared, bytes });
  return prepared;
}
