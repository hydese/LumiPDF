import { describe, expect, it } from "vitest";
import { formatCssColor, oklabToSrgb, parseCssColor, srgbToOklab } from "../../src/lib/dark/color";
import { createColorMapper } from "../../src/lib/dark/mapper";
import { DEFAULT_TUNING, READING_THEMES, getTheme } from "../../src/lib/dark/themes";

describe("colour parsing", () => {
  it("reads the formats pdf.js produces", () => {
    expect(parseCssColor("#ff0000")).toEqual({ rgb: [255, 0, 0], alpha: 1 });
    expect(parseCssColor("#f00")).toEqual({ rgb: [255, 0, 0], alpha: 1 });
    expect(parseCssColor("#00000080")?.alpha).toBeCloseTo(0.502, 2);
    expect(parseCssColor("rgb(10, 20, 30)")).toEqual({ rgb: [10, 20, 30], alpha: 1 });
    expect(parseCssColor("rgba(10,20,30,0.5)")).toEqual({ rgb: [10, 20, 30], alpha: 0.5 });
    expect(parseCssColor("white")).toEqual({ rgb: [255, 255, 255], alpha: 1 });
    expect(parseCssColor("hsl(10 20% 30%)")).toBeNull();
  });

  it("formats colours back", () => {
    expect(formatCssColor({ rgb: [255, 0, 16], alpha: 1 })).toBe("#ff0010");
    expect(formatCssColor({ rgb: [1, 2, 3], alpha: 0.25 })).toBe("rgba(1, 2, 3, 0.25)");
  });
});

describe("OKLab", () => {
  it("round-trips sRGB colours", () => {
    for (const rgb of [[0, 0, 0], [255, 255, 255], [200, 30, 40], [12, 90, 200]] as const) {
      const back = oklabToSrgb(srgbToOklab([...rgb]));
      back.forEach((v, i) => expect(Math.abs(v - rgb[i]!)).toBeLessThanOrEqual(1));
    }
  });

  it("keeps hue when reducing chroma to fit the gamut", () => {
    const out = oklabToSrgb({ L: 0.75, a: -0.05, b: -0.35 }); // very saturated blue, out of gamut
    expect(out[2]).toBeGreaterThan(out[0]);
    expect(out[2]).toBeGreaterThan(out[1]);
  });
});

describe("colour mapper", () => {
  const mapper = createColorMapper(getTheme("lumina-black"), DEFAULT_TUNING);
  const L = (rgb: [number, number, number]) => srgbToOklab(mapper.mapRgb(rgb)).L;

  it("turns paper into the background and ink into the text colour", () => {
    expect(mapper.mapRgb([255, 255, 255])).toEqual(parseCssColor("#121214")!.rgb);
    expect(mapper.mapRgb([0, 0, 0])).toEqual(parseCssColor("#e8e8e6")!.rgb);
  });

  it("keeps grey text clearly readable", () => {
    expect(L([128, 128, 128]) - L([255, 255, 255])).toBeGreaterThan(0.3);
  });

  it("keeps the hue of coloured ink and lifts it", () => {
    const red = mapper.mapRgb([180, 0, 0]);
    expect(red[0]).toBeGreaterThan(red[1] + 40);
    expect(L([180, 0, 0])).toBeGreaterThanOrEqual(0.69);
    const navy = mapper.mapRgb([0, 0, 140]);
    expect(navy[2]).toBeGreaterThan(navy[0] + 40);
  });

  it("turns light coloured fills into dark tints", () => {
    expect(L([255, 245, 200])).toBeLessThan(0.35);
  });

  it("maps paper and ink pixels like single colours, alpha untouched", () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 128]);
    mapper.mapPixels(px);
    const direct = [mapper.mapRgb([255, 255, 255]), mapper.mapRgb([0, 0, 0])];
    direct.forEach((rgb, i) => rgb.forEach((v, c) => expect(Math.abs(px[i * 4 + c]! - v)).toBeLessThanOrEqual(3)));
    expect(px[7]).toBe(128);
  });

  it("lifts grey image ink more than grey vector ink", () => {
    const px = new Uint8ClampedArray([90, 90, 90, 255]);
    mapper.mapPixels(px);
    const imageL = srgbToOklab([px[0]!, px[1]!, px[2]!]).L;
    expect(imageL).toBeGreaterThan(L([90, 90, 90]) + 0.03);
  });

  it("works for every theme", () => {
    for (const theme of READING_THEMES) {
      const m = createColorMapper(theme, DEFAULT_TUNING);
      expect(m.mapCss("#ffffff")).toBe(formatCssColor({ rgb: m.background, alpha: 1 }));
    }
  });
});

describe("contrast slider", () => {
  const theme = getTheme("lumina-black");
  const lum = (rgb: [number, number, number]) => srgbToOklab(rgb).L;
  it("changes the gap between text and background, and leaves the default as designed", () => {
    const low = createColorMapper(theme, { ...DEFAULT_TUNING, contrast: 0.7 });
    const mid = createColorMapper(theme, DEFAULT_TUNING);
    const high = createColorMapper(theme, { ...DEFAULT_TUNING, contrast: 1.4 });
    const gap = (m: typeof mid) => lum(m.mapRgb([0, 0, 0])) - lum(m.background);
    expect(gap(high)).toBeGreaterThan(gap(mid));
    expect(gap(mid)).toBeGreaterThan(gap(low));
    expect(lum(high.background)).toBeLessThan(lum(mid.background));
    // Grey text moves further from the background at high contrast.
    const grey = (m: typeof mid) => lum(m.mapRgb([120, 120, 120])) - lum(m.background);
    expect(grey(high)).toBeGreaterThan(grey(low));
  });
});
