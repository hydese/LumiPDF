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
/** Minimum lightness for coloured ink on the dark page. */
const INK_MIN_LIGHTNESS = 0.7;
/** Grid resolution of the lookup table used for image pixels (per channel). */
const LUT_STEPS = 33;

export interface ColorMapper {
  readonly key: string;
  readonly background: Rgb;
  mapRgb(rgb: Rgb): Rgb;
  /** Maps a CSS colour string; returns the input unchanged if it can't be parsed. */
  mapCss(css: string): string;
  /** Maps an RGBA pixel buffer in place (alpha untouched), using a 3D lookup table. */
  mapPixels(data: Uint8ClampedArray): void;
}

export function createColorMapper(theme: ReadingTheme, tuning: DarkTuning): ColorMapper {
  const bgRgb = parseCssColor(theme.background)!.rgb;
  const fgRgb = parseCssColor(theme.text)!.rgb;
  const bg = srgbToOklab(bgRgb);
  const fgBase = srgbToOklab(fgRgb);
  const fg: Lab = { ...fgBase, L: Math.min(0.99, fgBase.L * tuning.brightness) };
  // contrast > 1 lifts mid-tones (grey text, thin lines) further away from the background.
  const curve = 0.78 / tuning.contrast;

  function mapLab(c: Lab): Lab {
    const t = Math.max(0, Math.min(1, 1 - c.L)) ** curve; // 0 = paper white, 1 = black ink
    let L = bg.L + t * (fg.L - bg.L);
    // Neutral colours slide between the theme's background and text tints.
    let a = bg.a + t * (fg.a - bg.a);
    let b = bg.b + t * (fg.b - bg.b);
    const C = chroma(c);
    if (C > NEUTRAL_CHROMA) {
      if (c.L < INK_MAX_LIGHTNESS) L = Math.max(L, INK_MIN_LIGHTNESS * (fg.L / 0.93));
      a += c.a;
      b += c.b;
    }
    return { L, a, b };
  }

  const mapRgb = (rgb: Rgb): Rgb => oklabToSrgb(mapLab(srgbToOklab(rgb)));

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
          const out = mapRgb([Math.round(r * step), Math.round(g * step), Math.round(b * step)]);
          table[i++] = out[0];
          table[i++] = out[1];
          table[i++] = out[2];
        }
    return table;
  }

  function mapPixels(data: Uint8ClampedArray): void {
    lut ??= buildLut();
    const t = lut;
    const S = LUT_STEPS - 1;
    const strideG = LUT_STEPS * 3;
    const strideR = LUT_STEPS * LUT_STEPS * 3;
    for (let p = 0; p < data.length; p += 4) {
      const fr = (data[p]! * S) / 255;
      const fg2 = (data[p + 1]! * S) / 255;
      const fb = (data[p + 2]! * S) / 255;
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
