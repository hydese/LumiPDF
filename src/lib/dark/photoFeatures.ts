/**
 * The numbers the photo model looks at, measured on a small sample of an image (at most 64×64
 * RGBA pixels). Shared by the app and the training tools (kept in the private lab repository),
 * so both measure exactly the same way. No DOM here: Node runs it too.
 *
 * Each feature is a share or a level between 0 and 1. Photos (colour or black-and-white) have
 * many levels of grey, soft steps between neighbouring pixels and few flat areas; scans of text,
 * line drawings and flat graphics have few levels, sharp edges and large flat areas.
 */
export const FEATURE_NAMES = [
  "light",
  "colorful",
  "mid",
  "dark",
  "topColors",
  "lumLevels",
  "lumEntropy",
  "meanLum",
  "stdLum",
  "meanSpread",
  "softSteps",
  "sharpEdges",
  "flat",
  "colorBins",
  "transparent",
  "twoPeaks",
] as const;

export const FEATURE_COUNT = FEATURE_NAMES.length;

const lumOf = (r: number, g: number, b: number) => (r * 3 + g * 6 + b) / 10;

/** Features of an RGBA sample `width` × `height` pixels. */
export function photoFeatures(data: ArrayLike<number>, width: number, height: number): number[] {
  const n = width * height;
  const lum = new Float32Array(n);
  const seen = new Uint8Array(n);
  const lum64 = new Uint32Array(64);
  const lum16 = new Uint32Array(16);
  const bins = new Map<number, number>();
  let counted = 0, transparent = 0;
  let light = 0, colorful = 0, mid = 0, dark = 0, sum = 0, sum2 = 0, spreadSum = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 128) {
      transparent++;
      continue;
    }
    counted++;
    seen[p] = 1;
    const l = lumOf(r, g, b);
    lum[p] = l;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), spread = max - min;
    if (min > 160 && spread < 80) light++;
    else if (spread >= 48) colorful++;
    if (l >= 70 && l <= 175) mid++;
    if (l < 50) dark++;
    sum += l;
    sum2 += l * l;
    spreadSum += spread;
    lum64[Math.min(63, l >> 2)]!++;
    lum16[Math.min(15, l >> 4)]!++;
    const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  if (!counted) return [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1];
  const c = counted;
  const top = [...bins.values()].sort((x, y) => y - x).slice(0, 8).reduce((s, v) => s + v, 0);
  let levels = 0, entropy = 0;
  for (const v of lum64) {
    if (v / c >= 0.003) levels++;
    if (v) entropy -= (v / c) * Math.log2(v / c);
  }
  const peaks = [...lum16].sort((x, y) => y - x);
  const mean = sum / c;
  const std = Math.sqrt(Math.max(0, sum2 / c - mean * mean));
  // Steps between neighbouring pixels (right and below).
  let pairs = 0, soft = 0, sharp = 0, flat = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!seen[p]) continue;
      for (const q of [x + 1 < width ? p + 1 : -1, y + 1 < height ? p + width : -1]) {
        if (q < 0 || !seen[q]) continue;
        const d = Math.abs(lum[p]! - lum[q]!);
        pairs++;
        if (d < 1) flat++;
        else if (d <= 20) soft++;
        else if (d > 80) sharp++;
      }
    }
  }
  const P = Math.max(1, pairs);
  return [
    light / c,
    colorful / c,
    mid / c,
    dark / c,
    top / c,
    levels / 64,
    entropy / 6,
    mean / 255,
    std / 128,
    spreadSum / c / 255,
    soft / P,
    sharp / P,
    flat / P,
    Math.min(1, bins.size / 256),
    transparent / n,
    (peaks[0]! + peaks[1]!) / c,
  ];
}

export interface PhotoModel {
  /** Per feature: mean and spread used to standardise, and the weight. */
  mean: number[];
  scale: number[];
  weights: number[];
  bias: number;
  /**
   * Examples reported by testers, standardised: an image this close to one of them takes its
   * label, so a reported mistake never comes back.
   */
  reported: Array<{ x: number[]; photo: boolean }>;
  /** Squared distance under which an image counts as "the same" as a reported one. */
  reportedRadius: number;
}

export function standardise(model: Pick<PhotoModel, "mean" | "scale">, f: number[]): number[] {
  return f.map((v, i) => (v - model.mean[i]!) / model.scale[i]!);
}

/** Probability (0–1) that these features are a photo or a painting, to be kept as it is. */
export function photoProbability(model: PhotoModel, f: number[]): number {
  const x = standardise(model, f);
  for (const r of model.reported) {
    let d = 0;
    for (let i = 0; i < x.length; i++) d += (x[i]! - r.x[i]!) ** 2;
    if (d <= model.reportedRadius) return r.photo ? 1 : 0;
  }
  let z = model.bias;
  for (let i = 0; i < x.length; i++) z += model.weights[i]! * x[i]!;
  return 1 / (1 + Math.exp(-z));
}
