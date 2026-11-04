import { describe, expect, it } from "vitest";
import { destinationPoint, parseLinkHash } from "../../src/lib/reader/linkTarget";

describe("link targets", () => {
  it("decodes the hrefs pdf.js writes", () => {
    // pdf.js: "#" + escape(JSON.stringify(dest)) for explicit destinations.
    const explicit = [{ num: 12, gen: 0 }, { name: "XYZ" }, 72, 640.5, null];
    expect(parseLinkHash("#" + escape(JSON.stringify(explicit)))).toEqual({ explicit });
    expect(parseLinkHash("#" + escape("equation.2.1"))).toEqual({ named: "equation.2.1" });
    expect(parseLinkHash("#" + escape("Teorema – àè"))).toEqual({ named: "Teorema – àè" });
    expect(parseLinkHash("#page=4")).toEqual({ page: 4 });
    expect(parseLinkHash("#")).toBeNull();
    expect(parseLinkHash("#%5Bbroken")).toBeNull();
  });

  it("finds the point a destination shows", () => {
    expect(destinationPoint([0, { name: "XYZ" }, 72, 700, 0])).toEqual({ x: 72, y: 700 });
    expect(destinationPoint([0, { name: "XYZ" }, null, null, null])).toEqual({ x: null, y: null });
    expect(destinationPoint([0, { name: "FitH" }, 500])).toEqual({ x: null, y: 500 });
    expect(destinationPoint([0, { name: "FitR" }, 10, 20, 300, 400])).toEqual({ x: 10, y: 400 });
    expect(destinationPoint([0, { name: "Fit" }])).toEqual({ x: null, y: null });
  });
});
