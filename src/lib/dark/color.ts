/**
 * Colour maths for the dark engine: CSS colour parsing and sRGB <-> OKLab conversion.
 * OKLab is a perceptual colour space: L is lightness (0 black .. 1 white), a/b carry hue and
 * chroma. Inverting L while keeping a/b turns black ink light and keeps blue blue.
 */

export type Rgb = [number, number, number]; // 0..255
export interface Rgba {
  rgb: Rgb;
  alpha: number; // 0..1
}
export interface Lab {
  L: number;
  a: number;
  b: number;
}

const HEX = /^#([0-9a-f]{3,8})$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i;
const NAMED: Record<string, Rgba> = {
  white: { rgb: [255, 255, 255], alpha: 1 },
  black: { rgb: [0, 0, 0], alpha: 1 },
  transparent: { rgb: [0, 0, 0], alpha: 0 },
};

/** Parses the colour formats pdf.js produces (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), a few names). */
export function parseCssColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  const named = NAMED[s];
  if (named) return named;
  const hex = HEX.exec(s);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { rgb: [n(0), n(2), n(4)], alpha: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = RGB_FN.exec(s);
  if (fn) {
    const alphaRaw = fn[4];
    const alpha = alphaRaw === undefined ? 1 : alphaRaw.endsWith("%") ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw);
    return { rgb: [clamp255(+fn[1]!), clamp255(+fn[2]!), clamp255(+fn[3]!)], alpha: Math.min(1, Math.max(0, alpha)) };
  }
  return null;
}

export function formatCssColor({ rgb, alpha }: Rgba): string {
  if (alpha >= 1) return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number(alpha.toFixed(4))})`;
}

function clamp255(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

const toLinearTable = new Float64Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

function toSrgb8(linear: number): number {
  const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return clamp255(c * 255);
}

export function srgbToOklab([r, g, b]: Rgb): Lab {
  const lr = toLinearTable[r]!;
  const lg = toLinearTable[g]!;
  const lb = toLinearTable[b]!;
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab to linear sRGB; channels may fall outside 0..1 for out-of-gamut colours. */
function oklabToLinear({ L, a, b }: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (c: [number, number, number]) => c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/**
 * Converts OKLab to sRGB. Out-of-gamut colours keep their lightness and hue and lose just
 * enough chroma to fit, so a lifted dark blue stays blue instead of clipping to cyan.
 */
export function oklabToSrgb(lab: Lab): Rgb {
  let linear = oklabToLinear(lab);
  if (!inGamut(linear)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinear({ L: lab.L, a: lab.a * mid, b: lab.b * mid }))) lo = mid;
      else hi = mid;
    }
    linear = oklabToLinear({ L: lab.L, a: lab.a * lo, b: lab.b * lo });
  }
  return [toSrgb8(linear[0]), toSrgb8(linear[1]), toSrgb8(linear[2])];
}

export function chroma({ a, b }: Lab): number {
  return Math.hypot(a, b);
}
