/**
 * Image path of the dark engine. Images in a PDF are either "paper" (scans, handwritten notes,
 * screenshots of documents: mostly light, neutral background) or photos/figures. Paper images
 * are recoloured once at their own resolution, then drawn by pdf.js as usual, so they stay as
 * sharp as the original. Photos keep their colours, optionally a little dimmed.
 */
import type { ColorMapper } from "./mapper";

export type ImageKind = "paper" | "photo";

interface Analysis {
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
  const data = ctx.getImageData(0, 0, w, h).data;
  let light = 0;
  let opaque = true;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 255) opaque = false;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (a > 0 && min > LIGHT_MIN_CHANNEL && max - min < LIGHT_MAX_SPREAD) light++;
  }
  return { kind: light / (w * h) >= PAPER_RATIO ? "paper" : "photo", opaque };
}

function recolor(source: CanvasImageSource, width: number, height: number, mapper: ColorMapper): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);
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
    if (kind === "paper") prepared = { source: recolor(source, width, height, mapper), opaque };
    else if (dimPhotos) prepared = { source: dim(source, width, height), opaque };
  }
  const bytes = prepared.source === source ? 0 : width * height * 4;
  remember(source as object, { key, prepared, bytes });
  return prepared;
}
