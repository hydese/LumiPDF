/**
 * Colour mapping for one theme + tuning. Pure and synchronous: given a colour from the PDF,
 * returns the colour to draw in dark mode.
 *
 *  - White paper becomes the theme background, black ink the theme text colour.
 *  - Lightness is inverted in OKLab; hue is always kept.
 *  - Coloured ink (links, red warnings, plot lines) is lifted to a readable lightness.
 *  - Light coloured fills (highlight boxes, slide gradients) become dark tints of the same hue.
 */
import { chroma, formatCssColor, oklabToSrgb, parseCssColor, srgbToOklab, type Lab, type Rgb } from "./color";
import type { DarkTuning, ReadingTheme } from "./themes";

/** Below this OKLab chroma a colour counts as grey. */
const NEUTRAL_CHROMA = 0.03;
/** Coloured colours darker than this are treated as ink (text, lines) rather than fills. */
const INK_MAX_LIGHTNESS = 0.75;
/** Coloured ink is recognised gradually over ± this much lightness around INK_MAX_LIGHTNESS. */
const INK_FADE = 0.06;

function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}
/** Minimum lightness for coloured ink on the dark page. */
const INK_MIN_LIGHTNESS = 0.7;
/** Grid resolution of the lookup table used for image pixels (per channel). */
const LUT_STEPS = 33;
/** Mid-tone curve for vector colours; < 1 lifts greys away from the background. */
const BASE_CURVE = 0.7;
/**
 * Scanned and handwritten ink is thin and greyish in the image itself (pen pressure, scanner
 * blur), so image pixels get a stronger lift than vector colours.
 */
const IMAGE_CURVE_FACTOR = 0.72;

export interface ColorMapper {
  readonly key: string;
  readonly background: Rgb;
  mapRgb(rgb: Rgb): Rgb;
  /** Maps a CSS colour string; returns the input unchanged if it can't be parsed. */
  mapCss(css: string): string;
  /**
   * Maps an RGBA buffer of image pixels in place (alpha untouched), using a 3D lookup table.
   * Image pixels get a stronger mid-tone lift than vector colours (thin scanned ink).
   */
  mapPixels(data: Uint8ClampedArray, from?: number, to?: number): void;
}

export function createColorMapper(theme: ReadingTheme, tuning: DarkTuning): ColorMapper {
  const bgRgb = parseCssColor(theme.background)!.rgb;
  const fgRgb = parseCssColor(theme.text)!.rgb;
  const bgBase = srgbToOklab(bgRgb);
  const fgBase = srgbToOklab(fgRgb);
  // Contrast is the gap between text and background: above 1 the background gets darker, the
  // text a little brighter and grey text and lines move further from the background; below 1
  // the other way. (At 1 the theme is exactly as designed.)
  const k = tuning.contrast;
  const bg: Lab = { ...bgBase, L: Math.max(0, Math.min(0.6, bgBase.L * (1 - (k - 1) * 1.2))) };
  const fgL = Math.min(0.99, fgBase.L * tuning.brightness);
  const fg: Lab = { ...fgBase, L: Math.min(0.99, Math.max(bg.L + 0.25, bg.L + (fgL - bg.L) * (1 + (k - 1) * 0.35))) };
  const vectorCurve = BASE_CURVE / k ** 1.5;
  const imageCurve = vectorCurve * IMAGE_CURVE_FACTOR;

  function mapLab(c: Lab, curve = vectorCurve): Lab {
    const t = Math.max(0, Math.min(1, 1 - c.L)) ** curve; // 0 = paper white, 1 = black ink
    let L = bg.L + t * (fg.L - bg.L);
    // Neutral colours slide between the theme's background and text tints.
    let a = bg.a + t * (fg.a - bg.a);
    let b = bg.b + t * (fg.b - bg.b);
    // Both rules fade in over a small range instead of switching at a threshold: slide
    // backgrounds made of many bands of nearly the same beige would otherwise land on both
    // sides of the switch and show as visible steps in dark mode.
    const C = chroma(c);
    const colour = smoothstep(NEUTRAL_CHROMA * 0.5, NEUTRAL_CHROMA * 1.5, C);
    if (colour > 0) {
      const ink = colour * (1 - smoothstep(INK_MAX_LIGHTNESS - INK_FADE, INK_MAX_LIGHTNESS + INK_FADE, c.L));
      const lifted = Math.max(L, INK_MIN_LIGHTNESS * (fg.L / 0.93));
      L += (lifted - L) * ink;
      // A pale tinted fill turned dark keeps only as much colour as it kept lightness: a beige
      // slide becomes a dark page with a hint of warmth, not a saturated ochre (which also
      // made small differences between its bands look like steps). Coloured text keeps it all.
      const keep = Math.min(1, L / Math.max(0.05, c.L));
      a += c.a * colour * keep;
      b += c.b * colour * keep;
    }
    return { L, a, b };
  }

  const mapRgb = (rgb: Rgb): Rgb => oklabToSrgb(mapLab(srgbToOklab(rgb)));
  const mapImageRgb = (rgb: Rgb): Rgb => oklabToSrgb(mapLab(srgbToOklab(rgb), imageCurve));

  const cssCache = new Map<string, string>();
  function mapCss(css: string): string {
    let out = cssCache.get(css);
    if (out === undefined) {
      const parsed = parseCssColor(css);
      out = parsed ? formatCssColor({ rgb: mapRgb(parsed.rgb), alpha: parsed.alpha }) : css;
      cssCache.set(css, out);
    }
    return out;
  }

  let lut: Uint8Array | null = null;
  function buildLut(): Uint8Array {
    const table = new Uint8Array(LUT_STEPS ** 3 * 3);
    const step = 255 / (LUT_STEPS - 1);
    let i = 0;
    for (let r = 0; r < LUT_STEPS; r++)
      for (let g = 0; g < LUT_STEPS; g++)
        for (let b = 0; b < LUT_STEPS; b++) {
          const out = mapImageRgb([Math.round(r * step), Math.round(g * step), Math.round(b * step)]);
          table[i++] = out[0];
          table[i++] = out[1];
          table[i++] = out[2];
        }
    return table;
  }

  /**
   * Trilinear lookup per pixel, with a one-colour memory: pages are mostly long runs of the
   * same paper or ink colour, and those reuse the previous result (several times faster).
   * `from`/`to` map only that pixel range (byte offsets, multiples of 4).
   */
  function mapPixels(data: Uint8ClampedArray, from = 0, to = data.length): void {
    lut ??= buildLut();
    const t = lut;
    const S = LUT_STEPS - 1;
    const strideG = LUT_STEPS * 3;
    const strideR = LUT_STEPS * LUT_STEPS * 3;
    let lastIn = -1;
    let o0 = 0, o1 = 0, o2 = 0;
    for (let p = from; p < to; p += 4) {
      const R = data[p]!, G = data[p + 1]!, B = data[p + 2]!;
      const packed = (R << 16) | (G << 8) | B;
      if (packed === lastIn) {
        data[p] = o0;
        data[p + 1] = o1;
        data[p + 2] = o2;
        continue;
      }
      const fr = (R * S) / 255;
      const fg2 = (G * S) / 255;
      const fb = (B * S) / 255;
      const r0 = Math.min(S - 1, fr | 0);
      const g0 = Math.min(S - 1, fg2 | 0);
      const b0 = Math.min(S - 1, fb | 0);
      const dr = fr - r0;
      const dg = fg2 - g0;
      const db = fb - b0;
      const base = r0 * strideR + g0 * strideG + b0 * 3;
      for (let ch = 0; ch < 3; ch++) {
        const o = base + ch;
        const c000 = t[o]!, c001 = t[o + 3]!, c010 = t[o + strideG]!, c011 = t[o + strideG + 3]!;
        const c100 = t[o + strideR]!, c101 = t[o + strideR + 3]!, c110 = t[o + strideR + strideG]!, c111 = t[o + strideR + strideG + 3]!;
        const c00 = c000 + (c001 - c000) * db, c01 = c010 + (c011 - c010) * db;
        const c10 = c100 + (c101 - c100) * db, c11 = c110 + (c111 - c110) * db;
        const c0 = c00 + (c01 - c00) * dg, c1 = c10 + (c11 - c10) * dg;
        data[p + ch] = c0 + (c1 - c0) * dr;
      }
      lastIn = packed;
      o0 = data[p]!;
      o1 = data[p + 1]!;
      o2 = data[p + 2]!;
    }
  }

  return {
    key: `${theme.id}|${tuning.brightness}|${tuning.contrast}`,
    background: oklabToSrgb(bg),
    mapRgb,
    mapCss,
    mapPixels,
  };
}
