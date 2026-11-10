/**
 * Photo probe (development only): renders pages of a PDF in dark mode and reports every image
 * the dark engine prepares — its small sample, a thumbnail to look at, and what the app decided.
 * Driven by collect.mjs; the results stay on the developer's machine (never committed).
 */
import { loadDocument } from "../../src/lib/viewer/pdfjs";
import { setDarkMode } from "../../src/lib/dark/engine";
import { setImageProbe } from "../../src/lib/dark/images";
import { DEFAULT_TUNING } from "../../src/lib/dark/themes";
import { photoFeatures } from "../../src/lib/dark/photoFeatures";

interface Found {
  hash: string;
  page: number;
  width: number;
  height: number;
  kind: string;
  maskShare: number | null;
  features: number[];
  sample: string; // base64 RGBA
  w: number;
  h: number;
  thumb: string; // data URL
  dark: string; // data URL: what dark mode drew
}

function hashOf(data: Uint8ClampedArray): string {
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < data.length; i++) {
    h1 = Math.imul(h1 ^ data[i]!, 16777619);
    h2 = (h2 + data[i]! * (i + 1)) >>> 0;
  }
  return (h1 >>> 0).toString(16) + h2.toString(16);
}

function thumbOf(source: CanvasImageSource, width: number, height: number, max = 160): string {
  const s = Math.min(1, max / Math.max(width, height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width * s));
  c.height = Math.max(1, Math.round(height * s));
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

async function collect(url: string, pages: number[] | null, maxPerDoc = 400) {
  const found = new Map<string, Found>();
  let current = 0;
  setDarkMode({ theme: "lumina-black", tuning: DEFAULT_TUNING });
  setImageProbe(({ source, width, height, sample, kind, maskShare }) => {
    if (found.size >= maxPerDoc || width < 24 || height < 24) return;
    const hash = hashOf(sample.data);
    if (found.has(hash)) return;
    let bin = "";
    for (const b of sample.data) bin += String.fromCharCode(b);
    found.set(hash, {
      hash, page: current, width, height, kind, maskShare,
      features: photoFeatures(sample.data, sample.w, sample.h),
      sample: btoa(bin), w: sample.w, h: sample.h,
      thumb: thumbOf(source, width, height), dark: "",
    });
  });
  const pdf = await loadDocument(url, async () => null);
  try {
    const list = pages ?? Array.from({ length: pdf.doc.numPages }, (_, i) => i + 1);
    for (const n of list.filter((p) => p >= 1 && p <= pdf.doc.numPages)) {
      if (found.size >= maxPerDoc) break;
      current = n;
      const page = await pdf.doc.getPage(n);
      const viewport = page.getViewport({ scale: 0.4 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
    }
  } finally {
    setImageProbe(null);
    await pdf.close();
    setDarkMode(null);
  }
  return [...found.values()];
}

(window as unknown as { probe: unknown }).probe = { collect, ready: true };
