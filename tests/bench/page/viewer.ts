/**
 * Viewer check: opens a PDF through the app's real viewer component (PdfView + ViewerController)
 * and compares page 1's pixels with a plain pdf.js render at the same scale. In original mode
 * the two must match; any difference means our layer changed what pdf.js drew.
 */
import { mount, unmount } from "svelte";
import PdfView from "../../../src/lib/viewer/PdfView.svelte";
import { documentOptions, loadDocument, pdfjs } from "../../../src/lib/viewer/pdfjs";
import { setClipSnapping, setDarkMode } from "../../../src/lib/dark/engine";
import { DEFAULT_TUNING, type ThemeId } from "../../../src/lib/dark/themes";

function waitForPageCanvas(root: HTMLElement, pageNumber = 1): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const poll = () => {
      const page = root.querySelector(`.page[data-page-number="${pageNumber}"]`);
      const canvas = page?.querySelector("canvas");
      const rendered = page?.getAttribute("data-loaded") === "true" && canvas && canvas.width > 1;
      if (rendered) return resolve(canvas);
      if (performance.now() - started > 20000) return reject(new Error(`page ${pageNumber} did not render`));
      setTimeout(poll, 100);
    };
    poll();
  });
}

function pixelDifference(a: HTMLCanvasElement, b: HTMLCanvasElement) {
  const pa = a.getContext("2d")!.getImageData(0, 0, a.width, a.height).data;
  const pb = b.getContext("2d")!.getImageData(0, 0, b.width, b.height).data;
  let differing = 0;
  let maxDelta = 0;
  for (let i = 0; i < pa.length; i += 4) {
    const d = Math.max(Math.abs(pa[i]! - pb[i]!), Math.abs(pa[i + 1]! - pb[i + 1]!), Math.abs(pa[i + 2]! - pb[i + 2]!));
    if (d > 0) differing++;
    if (d > maxDelta) maxDelta = d;
  }
  return { differing, maxDelta };
}

async function check(url: string) {
  // Plumbing check: with the engine off and clip snapping off, the viewer must draw exactly
  // what pdf.js draws. (Snapping intentionally changes pixels at rectangle clip edges.)
  setDarkMode(null);
  setClipSnapping(false);
  const pdf = await loadDocument(url, async () => null);
  const target = document.getElementById("wrap")!;
  const view = mount(PdfView, { target, props: { doc: pdf.doc, onState: () => {}, onExternalLink: () => {} } });
  try {
    await waitForPageCanvas(target);
    await new Promise((r) => setTimeout(r, 400)); // let the text layer and any resize re-fit settle
    const canvas = await waitForPageCanvas(target); // pick it up again: a re-render replaces it

    // Reproduce the viewer's render exactly (see PDFPageView in pdf_viewer.mjs): the viewport
    // scale is the viewer's --scale-factor (zoom × 96/72); the canvas gets an extra x/y transform
    // only when its pixel size differs from the floored CSS size (screen scaling above 100%).
    // Reference: a completely separate, unhooked pdf.js document (no LumiPDF canvas factory,
    // no page wrapping), so any change our hooks make to pixels shows up here.
    const plainTask = pdfjs.getDocument(documentOptions(url));
    const plainDoc = await plainTask.promise;
    const page = await plainDoc.getPage(1);
    const viewerEl = target.querySelector<HTMLElement>(".pdfViewer")!;
    const scale = Number(getComputedStyle(viewerEl).getPropertyValue("--scale-factor"));
    const viewport = page.getViewport({ scale });
    const sx = canvas.width / Math.floor(viewport.width);
    const sy = canvas.height / Math.floor(viewport.height);
    const transform = sx !== 1 || sy !== 1 ? [sx, 0, 0, sy, 0, 0] : undefined;
    const reference = document.createElement("canvas");
    reference.width = canvas.width;
    reference.height = canvas.height;
    await page.render({ canvas: reference, viewport, transform }).promise;
    await plainTask.destroy();

    return {
      pages: pdf.doc.numPages,
      width: canvas.width,
      height: canvas.height,
      textSpans: target.querySelectorAll('.page[data-page-number="1"] .textLayer span').length,
      ...pixelDifference(canvas, reference),
    };
  } finally {
    await unmount(view);
    await pdf.close();
    setClipSnapping(true);
  }
}

/** Renders `pageNumber` through the real viewer in a reading theme and returns it as PNG. */
async function renderTheme(url: string, theme: ThemeId | "original", pageNumber: number) {
  setDarkMode(theme === "original" ? null : { theme, tuning: DEFAULT_TUNING });
  const pdf = await loadDocument(url, async () => null);
  const target = document.getElementById("wrap")!;
  let controller: import("../../../src/lib/viewer/ViewerController").ViewerController | null = null;
  const view = mount(PdfView, {
    target,
    props: {
      doc: pdf.doc,
      onState: () => {},
      onExternalLink: () => {},
      get controller() {
        return controller;
      },
      set controller(c) {
        controller = c;
      },
    },
  });
  try {
    if (pageNumber > 1) {
      await waitForPageCanvas(target, 1);
      controller!.goToPage(pageNumber);
    }
    const canvas = await waitForPageCanvas(target, pageNumber);
    await new Promise((r) => setTimeout(r, 200));
    return canvas.toDataURL("image/png");
  } finally {
    await unmount(view);
    await pdf.close();
    setDarkMode(null);
  }
}

/** Opens a PDF at a zoom level and reports how page 1's canvases relate to screen pixels. */
async function zoomProbe(url: string, zoom: number, textWeight = -1) {
  setDarkMode(textWeight < 0 ? null : { theme: "lumina-black", tuning: { ...DEFAULT_TUNING, textWeight } });
  const pdf = await loadDocument(url, async () => null);
  const target = document.getElementById("wrap")!;
  let controller: import("../../../src/lib/viewer/ViewerController").ViewerController | null = null;
  mount(PdfView, {
    target,
    props: {
      doc: pdf.doc,
      onState: () => {},
      onExternalLink: () => {},
      get controller() {
        return controller;
      },
      set controller(c) {
        controller = c;
      },
    },
  });
  await waitForPageCanvas(target, 1);
  (controller as unknown as { viewer: { currentScale: number } }).viewer.currentScale = zoom;
  await new Promise((r) => setTimeout(r, 2500));
  const canvases = [...target.querySelectorAll<HTMLCanvasElement>('.page[data-page-number="1"] canvas')].map((c) => {
    const r = c.getBoundingClientRect();
    return { cls: c.className, w: c.width, h: c.height, cssW: r.width, cssH: r.height, left: r.left, top: r.top, ratio: c.width / r.width };
  });
  const png = target.querySelector<HTMLCanvasElement>('.page[data-page-number="1"] canvas')!.toDataURL("image/png");
  return { dpr: devicePixelRatio, canvases, png };
}

(window as unknown as { viewerCheck: unknown }).viewerCheck = { check, renderTheme, setClipSnapping, zoomProbe, ready: true };
