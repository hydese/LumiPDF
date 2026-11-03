/**
 * Viewer check: opens a PDF through the app's real viewer component (PdfView + ViewerController)
 * and compares page 1's pixels with a plain pdf.js render at the same scale. In original mode
 * the two must match; any difference means our layer changed what pdf.js drew.
 */
import { mount, unmount } from "svelte";
import PdfView from "../../../src/lib/viewer/PdfView.svelte";
import { loadDocument } from "../../../src/lib/viewer/pdfjs";

function waitForPageCanvas(root: HTMLElement): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const poll = () => {
      const page = root.querySelector('.page[data-page-number="1"]');
      const canvas = page?.querySelector("canvas");
      const rendered = page?.getAttribute("data-loaded") === "true" && canvas && canvas.width > 1;
      if (rendered) return resolve(canvas);
      if (performance.now() - started > 20000) return reject(new Error("page 1 did not render"));
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
  const pdf = await loadDocument(url, async () => null);
  const target = document.getElementById("wrap")!;
  const view = mount(PdfView, { target, props: { doc: pdf.doc, onState: () => {}, onExternalLink: () => {} } });
  try {
    const canvas = await waitForPageCanvas(target);
    await new Promise((r) => setTimeout(r, 300)); // let the text layer settle

    // Reproduce the viewer's render exactly (see PDFPageView in pdf_viewer.mjs): the viewport
    // scale is the viewer's --scale-factor (zoom × 96/72); the canvas gets an extra x/y transform
    // only when its pixel size differs from the floored CSS size (screen scaling above 100%).
    const page = await pdf.doc.getPage(1);
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
  }
}

(window as unknown as { viewerCheck: unknown }).viewerCheck = { check, ready: true };
