import { describe, expect, it } from "vitest";
import { classifyPixels, photoMask } from "../../src/lib/dark/images";

/** A 64×64 sample built from colour shares: [[r, g, b], share]. */
function sample(parts: Array<[[number, number, number], number]>): Uint8ClampedArray {
  const n = 64 * 64;
  const data = new Uint8ClampedArray(n * 4);
  let i = 0;
  for (const [[r, g, b], share] of parts) {
    const count = Math.round(share * n);
    for (let k = 0; k < count && i < n; k++, i++) data.set([r, g, b, 255], i * 4);
  }
  const [last] = parts[parts.length - 1]!;
  for (; i < n; i++) data.set([...last, 255], i * 4);
  return data;
}

describe("dark mode: which pictures are recoloured", () => {
  it("recolours scans and documents", () => {
    // White paper, black text, a little grey from anti-aliasing.
    expect(classifyPixels(sample([[[250, 250, 248], 0.8], [[20, 20, 20], 0.15], [[128, 128, 128], 0.05]])).kind).toBe("paper");
    // Yellowed old paper with dark ink and a red pen mark.
    expect(classifyPixels(sample([[[238, 228, 200], 0.75], [[40, 35, 30], 0.2], [[200, 30, 30], 0.05]])).kind).toBe("paper");
  });

  it("recolours flat charts and diagrams", () => {
    const chart = sample([[[255, 255, 255], 0.55], [[0, 0, 0], 0.2], [[60, 60, 60], 0.17], [[30, 90, 200], 0.08]]);
    expect(classifyPixels(chart).kind).not.toBe("photo");
  });

  it("keeps the colours of logos and illustrations on white", () => {
    // Purple-and-black logo on white (Musei Nazionali di Firenze).
    expect(classifyPixels(sample([[[255, 255, 255], 0.6], [[20, 20, 20], 0.25], [[110, 60, 160], 0.15]])).kind).toBe("photo");
    // Pale blue drawing with darker blue lines.
    expect(classifyPixels(sample([[[250, 252, 255], 0.55], [[200, 220, 240], 0.25], [[70, 110, 190], 0.2]])).kind).toBe("photo");
  });

  it("keeps the colours of portraits and engravings", () => {
    // Watercolour portrait: skin tones, mid-tones, little pure white.
    expect(classifyPixels(sample([[[235, 215, 190], 0.35], [[200, 160, 120], 0.3], [[120, 100, 80], 0.25], [[60, 50, 40], 0.1]])).kind).toBe("photo");
  });
});

import { cleanScan } from "../../src/lib/dark/images";
describe("dark mode: scans", () => {
  it("turns paper grey into white and ink grey into black, leaving colour alone", () => {
    const px = new Uint8ClampedArray([225, 222, 215, 255, 45, 45, 50, 255, 132, 132, 132, 255, 200, 40, 40, 255]);
    cleanScan(px);
    expect([...px.slice(0, 3)]).toEqual([255, 255, 255]); // off-white paper → white
    expect([...px.slice(4, 7)]).toEqual([0, 0, 0]); // dark grey ink → black
    expect(px[8]).toBeGreaterThan(120); // mid grey stays mid
    expect(px[8]).toBeLessThan(135);
    expect([...px.slice(12, 15)]).toEqual([200, 40, 40]); // red pen untouched
  });
});

describe("photoMask", () => {
  /** A white page with dark text lines on the left half and a noisy colour photo on the right. */
  function brochure(w = 256, h = 160): Uint8ClampedArray {
    const d = new Uint8ClampedArray(w * h * 4);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 255;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let r = 250, g = 250, b = 248;
        if (x >= w / 2) {
          r = 60 + rnd() * 0.6; g = 110 + rnd() * 0.5; b = 40 + rnd() * 0.4; // foliage
        } else if (y % 12 < 2 && x > 10 && x < w / 2 - 10 && (x >> 3) % 3 !== 0) {
          r = g = b = 30; // text
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    return d;
  }

  it("keeps the photo half and recolours the text half", () => {
    const m = photoMask(brochure(), 256, 160);
    const at = (fx: number, fy: number) =>
      m.tiles[Math.floor(fy * m.rows) * m.cols + Math.floor(fx * m.cols)] === 1 || m.rects.some(([l, t, r, b]) => fx >= l && fx < r && fy >= t && fy < b);
    expect(at(0.75, 0.5)).toBe(true);
    expect(at(0.25, 0.5)).toBe(false);
    // The photo is a rectangle with exact edges: it starts at the middle of the picture.
    expect(m.rects).toHaveLength(1);
    expect(m.rects[0]![0]).toBeCloseTo(0.5, 2);
    expect(m.share).toBeGreaterThan(0.35);
    expect(m.share).toBeLessThan(0.65);
  });

  it("finds nothing to keep on a plain text page", () => {
    const w = 200, h = 200;
    const d = new Uint8ClampedArray(w * h * 4).fill(250);
    for (let y = 0; y < h; y++) for (let x = 20; x < 180; x++) if (y % 10 < 2) d.fill(25, (y * w + x) * 4, (y * w + x) * 4 + 3);
    expect(photoMask(d, w, h).share).toBe(0);
  });

  it("keeps an already-dark picture", () => {
    const w = 120, h = 120;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < d.length; i += 4) { d[i] = 15 + (i % 13); d[i + 1] = 18 + (i % 7); d[i + 2] = 30 + (i % 11); d[i + 3] = 255; }
    expect(photoMask(d, w, h).share).toBeGreaterThan(0.9);
  });
});
