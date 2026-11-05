import { describe, expect, it } from "vitest";
import { classifyPixels } from "../../src/lib/dark/images";

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
