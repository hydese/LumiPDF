import { describe, expect, it } from "vitest";
import { FEATURE_COUNT, photoFeatures, photoProbability } from "../../src/lib/dark/photoFeatures";
import { PHOTO_MODEL } from "../../src/lib/dark/photoModelWeights";

// The model's accuracy on its dataset is checked where the dataset lives (private lab
// repository). Here: the weights fit the features, and the basic cases come out right.
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
  it("has a weight for every feature", () => {
    expect(PHOTO_MODEL.weights).toHaveLength(FEATURE_COUNT);
    expect(PHOTO_MODEL.mean).toHaveLength(FEATURE_COUNT);
    expect(PHOTO_MODEL.scale).toHaveLength(FEATURE_COUNT);
  });

  it("knows a black-and-white photo from text on paper", () => {
    const bw = image(64, 64, (x, y) => {
      const v = Math.round(110 + 70 * Math.sin(x / 9) * Math.cos(y / 13) + ((x * 7 + y * 13) % 11));
      return [v, v, v];
    });
    const text = image(64, 64, (x, y) => (y % 8 < 2 && x % 6 < 4 ? [20, 20, 20] : [250, 250, 250]));
    expect(isPhoto(bw)).toBe(true);
    expect(isPhoto(text)).toBe(false);
  });

  it("recolours flat charts", () => {
    const bars = image(64, 64, (x, y) => (y > 10 && x % 16 > 3 ? ([[31, 119, 180], [255, 127, 14], [44, 160, 44], [214, 39, 40]][Math.floor(x / 16)] as [number, number, number]) : [224, 224, 224]));
    expect(isPhoto(bars)).toBe(false);
  });
});
