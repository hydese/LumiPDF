/**
 * Browser side of the rendering bench. `run.mjs` loads this page in Chromium/WebKit and calls
 * `window.bench.render()` for each PDF. Rendering variants (original, dark themes) are added
 * here as the engine is built, so every change can be compared on the same files.
 */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PageResult {
  page: number;
  width: number;
  height: number;
  rotate: number;
  png: string;
}

export interface RenderResult {
  ok: boolean;
  error?: string;
  numPages?: number;
  pages?: PageResult[];
}

async function render(url: string, pages: number[], scale: number, dpr: number): Promise<RenderResult> {
  try {
    const task = pdfjs.getDocument({
      url,
      cMapUrl: "/node_modules/pdfjs-dist/cmaps/",
      standardFontDataUrl: "/node_modules/pdfjs-dist/standard_fonts/",
      wasmUrl: "/node_modules/pdfjs-dist/wasm/",
      isEvalSupported: false,
    });
    const doc = await task.promise;
    const out: PageResult[] = [];
    for (const n of pages.filter((p) => p >= 1 && p <= doc.numPages)) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      out.push({ page: n, width: canvas.width, height: canvas.height, rotate: page.rotate, png: canvas.toDataURL("image/png") });
      page.cleanup();
    }
    const numPages = doc.numPages;
    await task.destroy();
    return { ok: true, numPages, pages: out };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

(window as unknown as { bench: unknown }).bench = { render, ready: true };
