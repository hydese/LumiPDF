import { describe, expect, it } from "vitest";
import { FEATURE_COUNT, photoFeatures, photoProbability } from "../../src/lib/dark/photoFeatures";
import { PHOTO_MODEL } from "../../src/lib/dark/photoModelWeights";
import dataset from "../photo-model/dataset.json";

interface Row {
  from: string;
  photo: boolean;
  f: number[];
  reported?: boolean;
}
const rows = dataset as Row[];
const isPhoto = (f: number[]) => photoProbability(PHOTO_MODEL, f) >= 0.5;

function image(w: number, h: number, pixel: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  return photoFeatures(data, w, h);
}

describe("photo model", () => {
  it("matches the dataset it was trained on", () => {
    expect(PHOTO_MODEL.weights).toHaveLength(FEATURE_COUNT);
    for (const r of rows) expect(r.f).toHaveLength(FEATURE_COUNT);
    const right = rows.filter((r) => isPhoto(r.f) === r.photo).length;
    expect(right / rows.length).toBeGreaterThanOrEqual(0.97);
  });

  it("never gets a reported example wrong", () => {
    for (const r of rows.filter((r) => r.reported)) expect(isPhoto(r.f), r.from).toBe(r.photo);
  });

  it("knows a black-and-white photo from text on paper", () => {
    // Soft shading in many greys, like a portrait.
    const bw = image(64, 64, (x, y) => {
      const v = Math.round(110 + 70 * Math.sin(x / 9) * Math.cos(y / 13) + ((x * 7 + y * 13) % 11));
      return [v, v, v];
    });
    // Black strokes on white, like a scanned page.
    const text = image(64, 64, (x, y) => (y % 8 < 2 && x % 6 < 4 ? [20, 20, 20] : [250, 250, 250]));
    expect(isPhoto(bw)).toBe(true);
    expect(isPhoto(text)).toBe(false);
  });
});
