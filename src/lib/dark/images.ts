/**
 * Image path of the dark engine. Images in a PDF are "paper" (scans, handwritten notes,
 * screenshots of documents: mostly light background), "graphic" (raster charts and diagrams:
 * a few flat colours) or photos. Paper and graphics are recoloured once at their own resolution,
 * then drawn by pdf.js as usual, so they stay as sharp as the original. Photos keep their
 * colours, optionally a little dimmed.
 */
import type { ColorMapper } from "./mapper";
import { photoFeatures, photoProbability } from "./photoFeatures";
import { PHOTO_MODEL } from "./photoModelWeights";

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

let cache = new WeakMap<object, CacheEntry>();
const cacheOrder: Array<{ source: WeakRef<object>; entry: CacheEntry }> = [];
let cacheBytes = 0;

export function imageSize(source: CanvasImageSource): { width: number; height: number } {
  const s = source as { width?: number; height?: number; displayWidth?: number; displayHeight?: number; naturalWidth?: number; naturalHeight?: number };
  return {
    width: s.naturalWidth || s.displayWidth || s.width || 0,
    height: s.naturalHeight || s.displayHeight || s.height || 0,
  };
}

/** What the image looks like in small (at most 64×64), used to decide what kind it is. */
export interface Sample {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

function sampleOf(source: CanvasImageSource, width: number, height: number): Sample {
  const w = Math.min(SAMPLE_SIZE, width);
  const h = Math.min(SAMPLE_SIZE, height);
  const sample = document.createElement("canvas");
  sample.width = w;
  sample.height = h;
  const ctx = sample.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, width, height, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/**
 * The photo model (photoFeatures.ts, trained in the private lab repository) decides whether an image is a
 * photo or painting to keep as it is; the rules above then tell paper from graphics. The rules
 * alone missed black-and-white photos (no colour, few shades of each channel) and kept flat
 * diagrams with a pale colour area.
 */
export function isPhoto(sample: Sample): boolean {
  return photoProbability(PHOTO_MODEL, photoFeatures(sample.data, sample.w, sample.h)) >= 0.5;
}

function judge(sample: Sample, override: boolean | null): Analysis {
  const rules = classifyPixels(sample.data);
  if (override ?? isPhoto(sample)) return { kind: "photo", opaque: rules.opaque };
  if (rules.kind !== "photo") return rules;
  // Not a photo after all. Already-dark pictures stay as the rules said (recolouring them
  // would turn them light); others are paper or graphics.
  const f = photoFeatures(sample.data, sample.w, sample.h);
  if (f[7]! * 255 < MASK_DARK && override === null) return rules;
  return { kind: f[0]! >= PAPER_RATIO ? "paper" : "graphic", opaque: rules.opaque };
}

/**
 * Images a beta tester marked as photo or not (right-click on the image): remembered by their
 * sample, so the same picture is judged the same way everywhere it appears.
 */
const overrides = new Map<string, boolean>();
const sourceKeys = new WeakMap<object, string>();

export function sampleKey(sample: Sample): string {
  const d = sample.data;
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < d.length; i++) {
    h1 = Math.imul(h1 ^ d[i]!, 16777619);
    h2 = (h2 + d[i]! * (i + 1)) >>> 0;
  }
  return `${sample.w}x${sample.h}:${(h1 >>> 0).toString(16)}${h2.toString(16)}`;
}

export function setPhotoOverrides(entries: Iterable<[string, boolean]>): void {
  overrides.clear();
  for (const [k, v] of entries) overrides.set(k, v);
  cacheOrder.length = 0;
  cacheBytes = 0;
  cache = new WeakMap();
}

/** BETA (photo training): what the app sees in an image and how it judges it. */
export function describeImage(source: CanvasImageSource): { key: string; width: number; height: number; features: number[]; probability: number; rules: ImageKind; override: boolean | null } | null {
  const { width, height } = imageSize(source);
  if (width < 2 || height < 2) return null;
  const sample = sampleOf(source, width, height);
  const features = photoFeatures(sample.data, sample.w, sample.h);
  const key = sampleKey(sample);
  return { key, width, height, features, probability: photoProbability(PHOTO_MODEL, features), rules: classifyPixels(sample.data).kind, override: overrides.get(key) ?? null };
}

function overrideOf(source: CanvasImageSource): boolean | null {
  const key = sourceKeys.get(source as object);
  return key === undefined ? null : (overrides.get(key) ?? null);
}

/**
 * Development only (the training probe in the private lab repository): told about every image dark mode
 * prepares. Never set in the app.
 */
export type ImageProbe = (info: { source: CanvasImageSource; width: number; height: number; sample: Sample; kind: ImageKind; maskShare: number | null }) => void;
let probe: ImageProbe | null = null;
export function setImageProbe(p: ImageProbe | null): void {
  probe = p;
}

/**
 * Pixels with at least this much colour (max − min channel) are "colourful". A picture with a
 * real share of them (a logo, an illustration, a portrait, pixel art) keeps its colours: the
 * reader looks at it, and recolouring it the way paper is recoloured made whites black and
 * shifted every hue. Scans and charts have almost none (a coloured line here and there).
 */
const COLORFUL_SPREAD = 48;
const TINT_MIN_CHANNEL = 160;
const TINT_MAX_SPREAD = 80;
const CHART_COLORFUL_SHARE = 0.4;
const CHART_LIGHT_SHARE = 0.2;
const CHART_TOP_COLORS = 0.7;
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
  const colorBins = new Map<number, number>(); // the same, for colourful pixels only
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
    // Pale tints (a light cyan slide header, cream paper) are paper, not colour.
    if (min > TINT_MIN_CHANNEL && spread < TINT_MAX_SPREAD) light++;
    else if (spread >= COLORFUL_SPREAD) {
      colorful++;
      colorBins.set(bin, (colorBins.get(bin) ?? 0) + 1);
    } else if (min > LIGHT_MIN_CHANNEL && spread < LIGHT_MAX_SPREAD) light++;
    const lum = (r * 3 + g * 6 + b) / 10;
    if (lum >= MID_MIN && lum <= MID_MAX) mid++;
  }
  if (counted === 0) return { kind: "paper", opaque };
  // A chart: big areas of a few flat colours on a light background (photos have many shades).
  const topColors = [...colorBins.values()].sort((x, y) => y - x).slice(0, 4).reduce((sum, n) => sum + n, 0);
  if (colorful / counted >= CHART_COLORFUL_SHARE && light / counted >= CHART_LIGHT_SHARE && topColors / Math.max(1, colorful) >= CHART_TOP_COLORS) return { kind: "graphic", opaque };
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

/**
 * Whole-page pictures (flattened brochures, slides exported as images, magazine scans) mix text
 * on a plain background with photos, so one verdict for the whole picture is wrong for part of
 * it. Big images are looked at in tiles: photo areas keep their colours, the rest is recoloured.
 */
const MIXED_MIN_SIDE = 300;
const MASK_SAMPLE = 512;
const MASK_TILE = 8;
/** Below this share of photo tiles the picture is treated as a whole; above, as a photo. */
const MIXED_MIN_SHARE = 0.02;
const MIXED_MAX_SHARE = 0.9;
/** Smallest photo area kept, in tiles (smaller colourful bits, like icons, are recoloured). */
const MASK_MIN_TILES = 6;
/** A photo area that fills this much of its bounding box becomes that whole rectangle. */
const MASK_RECT_FILL = 0.55;
/**
 * Tiles are used only on pages with a plain light background around the photos (brochures,
 * magazine pages); gradients, slides and charts are judged as a whole, as before.
 */
const MIXED_BG_SHARE = 0.25;
const MIXED_BG_LUM = 190;
/** Average luminance under which an area counts as already dark. */
const MASK_DARK = 70;
/** A tile group with this many of 16 grey levels (and many mid-tones) is a black-and-white photo. */
const GREY_PHOTO_LEVELS = 11;

export interface PhotoMask {
  cols: number;
  rows: number;
  /** 1 where the tile is part of a photo. Row-major, cols × rows. */
  tiles: Uint8Array;
  /** Share of tiles that are photo. */
  share: number;
  /** Share of the picture's width and height the tiles cover (the last partial tile is left out). */
  coverX: number;
  coverY: number;
  /**
   * Rectangular photos, with edges found to the pixel: [left, top, right, bottom] as shares of
   * the picture's size. Their tiles are not in `tiles`.
   */
  rects: Array<[number, number, number, number]>;
  /** Share of the picture that is plain page background, and whether that background is light. */
  background: { share: number; light: boolean };
}

/** How far a photo's edge may move from its tile box while being refined, in tiles. */
const EDGE_GROW_TILES = 12;
const EDGE_SHRINK_TILES = 2;
/** A pixel counts as page background within this distance (per channel) of its colour. */
const BG_TOLERANCE = 9;

/**
 * Which tiles of an RGBA sample (`width` × `height`) belong to photos. Each tile is judged with
 * its neighbours (a tile alone is too few pixels), then photo areas are cleaned up: specks are
 * dropped, and areas that are nearly rectangular are filled to their rectangle, so a pale sky
 * or a white wall inside a photo stays part of it. Exported for tests.
 */
export function photoMask(data: Uint8ClampedArray, width: number, height: number, tile = MASK_TILE): PhotoMask {
  const cols = Math.max(1, Math.floor(width / tile));
  const rows = Math.max(1, Math.floor(height / tile));
  const n = cols * rows;
  const colorful = new Float32Array(n);
  const mid = new Float32Array(n);
  const lumSum = new Float32Array(n);
  const counts = new Float32Array(n);
  const binsets: Array<Set<number>> = Array.from({ length: n }, () => new Set());
  const greys = new Uint16Array(n); // which of 16 brightness levels appear (one bit each)
  for (let y = 0; y < rows * tile; y++) {
    const ty = Math.floor(y / tile);
    for (let x = 0; x < cols * tile; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3]! === 0) continue;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      const t = ty * cols + Math.floor(x / tile);
      counts[t]!++;
      if (Math.max(r, g, b) - Math.min(r, g, b) >= COLORFUL_SPREAD) colorful[t]!++;
      const lum = (r * 3 + g * 6 + b) / 10;
      lumSum[t]! += lum;
      if (lum >= MID_MIN && lum <= MID_MAX) mid[t]!++;
      binsets[t]!.add(((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5));
      greys[t]! |= 1 << Math.min(15, lum >> 4);
    }
  }
  const raw = new Uint8Array(n);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      let c = 0, m = 0, total = 0, l = 0, levels = 0;
      const bins = new Set<number>();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx, y = ty + dy;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const t = y * cols + x;
          c += colorful[t]!;
          m += mid[t]!;
          l += lumSum[t]!;
          total += counts[t]!;
          for (const b of binsets[t]!) bins.add(b);
          levels |= greys[t]!;
        }
      }
      if (total === 0) continue;
      // Kept as they are: photos (real colour, or many mid-tones in many shades: black-and-white
      // photos) and areas that are already dark (a dark cover, a dark band, a night photo), which
      // recolouring would turn light. Text on a plain light background has few shades and is
      // light on average; flat graphics have few colours.
      const mean = l / total;
      // Real photos have many shades; flat coloured shapes (chart bars, logos) don't.
      // Black-and-white photos have no colour bins to speak of: count levels of grey instead.
      let greyLevels = 0;
      for (let v = levels; v; v &= v - 1) greyLevels++;
      const keep =
        (c / total >= 0.18 && bins.size >= 16) ||
        (m / total >= 0.25 && (bins.size >= 12 || (greyLevels >= GREY_PHOTO_LEVELS && c / total < 0.05))) || (mean < MASK_DARK && bins.size >= 3) || mean < MASK_DARK / 2;
      raw[ty * cols + tx] = keep ? 1 : 0;
    }
  }
  // Close one-tile gaps (a pale wall inside a photo, a seam between photos), then look at the
  // connected areas: drop specks, square off nearly rectangular ones.
  const grown = new Uint8Array(n);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = y * cols + x;
      if (raw[t]) {
        grown[t] = 1;
        continue;
      }
      const h = x > 0 && x < cols - 1 && raw[t - 1] && raw[t + 1];
      const v = y > 0 && y < rows - 1 && raw[t - cols] && raw[t + cols];
      if (h || v) grown[t] = 1;
    }
  }
  raw.set(grown);
  const tiles = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const boxes: Array<[number, number, number, number]> = [];
  for (let start = 0; start < n; start++) {
    if (!raw[start] || seen[start]) continue;
    const members: number[] = [];
    let x0 = cols, y0 = rows, x1 = -1, y1 = -1;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const t = stack.pop()!;
      members.push(t);
      const x = t % cols, y = (t - x) / cols;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const u = ny * cols + nx;
        if (raw[u] && !seen[u]) {
          seen[u] = 1;
          stack.push(u);
        }
      }
    }
    if (members.length < MASK_MIN_TILES) continue;
    const box = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (members.length / box >= MASK_RECT_FILL) {
      boxes.push([x0 * tile, y0 * tile, (x1 + 1) * tile, (y1 + 1) * tile]);
      continue;
    }
    // Irregular (a photo touching a dark band, an L of photos): take out the biggest rectangles
    // it's made of; whatever is left stays as tiles.
    const left = new Uint8Array(n);
    for (const t of members) left[t] = 1;
    for (;;) {
      const r = largestRect(left, cols, x0, y0, x1, y1);
      if (!r || (r[2] - r[0]) * (r[3] - r[1]) < MASK_MIN_TILES * 2) break;
      for (let y = r[1]; y < r[3]; y++) left.fill(0, y * cols + r[0], y * cols + r[2]);
      boxes.push([r[0] * tile, r[1] * tile, r[2] * tile, r[3] * tile]);
    }
    for (const t of members) if (left[t]) tiles[t] = 1;
  }

  // Page background: the commonest colour outside the kept areas.
  const hist = new Map<number, [number, number, number, number]>();
  for (let y = 0; y < rows * tile; y++) {
    for (let x = 0; x < cols * tile; x++) {
      if (raw[Math.floor(y / tile) * cols + Math.floor(x / tile)]) continue;
      const i = (y * width + x) * 4;
      const key = ((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4);
      const e = hist.get(key) ?? [0, 0, 0, 0];
      e[0] += data[i]!; e[1] += data[i + 1]!; e[2] += data[i + 2]!; e[3]++;
      hist.set(key, e);
    }
  }
  let best: [number, number, number, number] | null = null;
  for (const e of hist.values()) if (!best || e[3] > best[3]) best = e;
  const bg = best ? [best[0] / best[3], best[1] / best[3], best[2] / best[3]] : null;
  const isBg = (x: number, y: number) => {
    if (!bg) return false;
    const i = (y * width + x) * 4;
    return Math.abs(data[i]! - bg[0]!) <= BG_TOLERANCE && Math.abs(data[i + 1]! - bg[1]!) <= BG_TOLERANCE && Math.abs(data[i + 2]! - bg[2]!) <= BG_TOLERANCE;
  };
  /** Share of background pixels in column x (rows y0..y1) or row y (columns x0..x1). */
  const colBg = (x: number, y0: number, y1: number) => {
    let k = 0;
    for (let y = y0; y < y1; y++) if (isBg(x, y)) k++;
    return k / Math.max(1, y1 - y0);
  };
  const rowBg = (y: number, x0: number, x1: number) => {
    let k = 0;
    for (let x = x0; x < x1; x++) if (isBg(x, y)) k++;
    return k / Math.max(1, x1 - x0);
  };

  // Rectangular photos: move each edge out over photo pixels (a pale ceiling or sky is still
  // not page background) and in over background margins, to where the photo really ends.
  const rects: PhotoMask["rects"] = [];
  let rectArea = 0;
  for (const b of boxes) {
    let [x0, y0, x1, y1] = b;
    if (bg) {
      const grow = EDGE_GROW_TILES * tile, shrink = EDGE_SHRINK_TILES * tile;
      for (let i = 0; i < 2; i++) {
        let lim = Math.max(0, b[0] - grow);
        while (x0 > lim && colBg(x0 - 1, y0, y1) < 0.5) x0--;
        lim = Math.min(x1 - 1, b[0] + shrink);
        while (x0 < lim && colBg(x0, y0, y1) >= 0.9) x0++;
        lim = Math.min(width, b[2] + grow);
        while (x1 < lim && colBg(x1, y0, y1) < 0.5) x1++;
        lim = Math.max(x0 + 1, b[2] - shrink);
        while (x1 > lim && colBg(x1 - 1, y0, y1) >= 0.9) x1--;
        lim = Math.max(0, b[1] - grow);
        while (y0 > lim && rowBg(y0 - 1, x0, x1) < 0.5) y0--;
        lim = Math.min(y1 - 1, b[1] + shrink);
        while (y0 < lim && rowBg(y0, x0, x1) >= 0.9) y0++;
        lim = Math.min(height, b[3] + grow);
        while (y1 < lim && rowBg(y1, x0, x1) < 0.5) y1++;
        lim = Math.max(y0 + 1, b[3] - shrink);
        while (y1 > lim && rowBg(y1 - 1, x0, x1) >= 0.9) y1--;
      }
    }
    // Judge the rectangle as a whole: a photo, or an already-dark area. Flat graphics (chart
    // bars and their background) and pale gradients (slide backgrounds) are not kept.
    if (!keepRect(data, width, x0, y0, x1, y1)) continue;
    rects.push([x0 / width, y0 / height, x1 / width, y1 / height]);
    rectArea += (x1 - x0) * (y1 - y0);
  }

  // Leftover irregular bits are recoloured: soft tile edges looked like blotches on gradients.
  tiles.fill(0);
  const photo = 0;
  const share = Math.min(1, (photo * tile * tile + rectArea) / (width * height));
  let bgPixels = 0;
  if (bg) for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) if (isBg(x, y)) bgPixels++;
  const background = { share: bgPixels / Math.max(1, Math.ceil(width / 2) * Math.ceil(height / 2)), light: !!bg && (bg[0]! * 3 + bg[1]! * 6 + bg[2]!) / 10 >= MIXED_BG_LUM };
  return { cols, rows, tiles, share, coverX: Math.min(1, (cols * tile) / width), coverY: Math.min(1, (rows * tile) / height), rects, background };
}

/** Whether the area x0..x1 × y0..y1 of an RGBA sample should keep its original pixels. */
function keepRect(data: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const w = x1 - x0, h = y1 - y0;
  if (w < 2 || h < 2) return false;
  const step = Math.max(1, Math.floor(Math.max(w, h) / 64));
  const out: number[] = [];
  let lum = 0;
  const sw = Math.ceil((x1 - x0) / step), sh = Math.ceil((y1 - y0) / step);
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      out.push(data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!);
      lum += (data[i]! * 3 + data[i + 1]! * 6 + data[i + 2]!) / 10;
    }
  }
  const px = new Uint8ClampedArray(out);
  if (lum / (px.length / 4) < MASK_DARK) return true;
  return isPhoto({ data: px, w: sw, h: sh });
}

/** The largest all-ones rectangle of `grid` inside the box (x0..x1, y0..y1 inclusive): [x0, y0, x1, y1) or null. */
function largestRect(grid: Uint8Array, cols: number, bx0: number, by0: number, bx1: number, by1: number): [number, number, number, number] | null {
  const w = bx1 - bx0 + 1;
  const heights = new Int32Array(w);
  let best: [number, number, number, number] | null = null;
  let bestArea = 0;
  for (let y = by0; y <= by1; y++) {
    for (let i = 0; i < w; i++) heights[i] = grid[y * cols + bx0 + i] ? heights[i]! + 1 : 0;
    const stack: number[] = [];
    for (let i = 0; i <= w; i++) {
      const h = i < w ? heights[i]! : 0;
      while (stack.length && heights[stack.at(-1)!]! >= h) {
        const top = stack.pop()!;
        const height = heights[top]!;
        const start = stack.length ? stack.at(-1)! + 1 : 0;
        const area = height * (i - start);
        if (area > bestArea) {
          bestArea = area;
          best = [bx0 + start, y - height + 1, bx0 + i, y + 1];
        }
      }
      stack.push(i);
    }
  }
  return best;
}

function maskOf(source: CanvasImageSource, width: number, height: number): PhotoMask | null {
  if (Math.min(width, height) < MIXED_MIN_SIDE) return null;
  const k = Math.min(1, MASK_SAMPLE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  const sample = document.createElement("canvas");
  sample.width = w;
  sample.height = h;
  const ctx = sample.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, width, height, 0, 0, w, h);
  return photoMask(ctx.getImageData(0, 0, w, h).data, w, h);
}

/**
 * Recolours the picture except its photo rectangles, which keep their original pixels (dimmed
 * if asked). Only the pixels outside the photos are mapped, row by row, so photo-heavy pages
 * cost little.
 */
function recolorMixed(source: CanvasImageSource, width: number, height: number, mapper: ColorMapper, mask: PhotoMask, dimPhotos: boolean, scan: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;
  const rects = mask.rects.map(([l, t, r, b]) => [Math.round(l * width), Math.round(t * height), Math.round(r * width), Math.round(b * height)] as const);
  const shade = 1 - PHOTO_DIM;
  const spans: Array<[number, number]> = [];
  for (let y = 0; y < height; y++) {
    // The kept (photo) spans of this row, merged and sorted.
    spans.length = 0;
    for (const [x0, y0, x1, y1] of rects) if (y >= y0 && y < y1 && x1 > x0) spans.push([Math.max(0, x0), Math.min(width, x1)]);
    spans.sort((a, b) => a[0] - b[0]);
    const row = y * width * 4;
    let x = 0;
    for (const [a, b] of spans) {
      if (a > x) mapRun(data, row + x * 4, row + a * 4, mapper, scan);
      if (dimPhotos) for (let i = row + Math.max(x, a) * 4; i < row + b * 4; i += 4) {
        data[i] = data[i]! * shade;
        data[i + 1] = data[i + 1]! * shade;
        data[i + 2] = data[i + 2]! * shade;
      }
      x = Math.max(x, b);
    }
    if (x < width) mapRun(data, row + x * 4, row + width * 4, mapper, scan);
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

function mapRun(data: Uint8ClampedArray, from: number, to: number, mapper: ColorMapper, scan: boolean): void {
  if (scan) cleanScan(data.subarray(from, to));
  mapper.mapPixels(data, from, to);
}

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

  const sample = sampleOf(source, width, height);
  sourceKeys.set(source as object, sampleKey(sample));
  const override = overrideOf(source);
  const { kind, opaque } = judge(sample, override);
  let prepared: Prepared = { source, opaque };
  // A tester's "It's a photo / Not a photo" applies to the whole image.
  const mask = override === null && width * height <= MAX_RECOLOR_PIXELS ? maskOf(source, width, height) : null;
  probe?.({ source, width, height, sample, kind, maskShare: mask ? mask.share : null });
  if (override === true) {
    if (dimPhotos) prepared = { source: dim(source, width, height), opaque };
  } else if (mask && mask.share > MIXED_MAX_SHARE) {
    // Almost all photo or already dark: keep it.
    if (dimPhotos) prepared = { source: dim(source, width, height), opaque };
  } else if (mask && mask.share >= MIXED_MIN_SHARE && mask.background.light && mask.background.share >= MIXED_BG_SHARE) {
    prepared = { source: recolorMixed(source, width, height, mapper, mask, dimPhotos, kind === "paper"), opaque };
  } else if (width * height <= MAX_RECOLOR_PIXELS) {
    if (kind === "paper" || kind === "graphic") prepared = { source: recolor(source, width, height, mapper, kind === "paper"), opaque };
    else if (dimPhotos) prepared = { source: dim(source, width, height), opaque };
  }
  const bytes = prepared.source === source ? 0 : width * height * 4;
  remember(source as object, { key, prepared, bytes });
  return prepared;
}
