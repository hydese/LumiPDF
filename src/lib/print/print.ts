/**
 * Printing. Pages are drawn as pictures into a print-only container (hidden on screen), and
 * the system print dialog prints that. Windows uses the webview's own print preview; on the
 * Mac, WebKit ignores window.print() inside an app, so the native print operation is used.
 *
 * PDFs are printed from a temporary copy that has the annotations written in (Rust), always in
 * their original colours (never the dark reading theme).
 */
import { invoke } from "@tauri-apps/api/core";
import { documentOptions, pdfjs } from "../viewer/pdfjs";
import { platform } from "../platform/window";
import type { ExportAnnotation } from "../ipc/export";

export interface PrintPage {
  url: string;
  /** Shape, so landscape pages print landscape. */
  landscape: boolean;
}

/** Print resolution: sharp text without huge memory use for long books. */
const PRINT_DPI = 150;
const CONTAINER_ID = "lumi-print";

let lastUrls: string[] = [];

function container(): HTMLDivElement {
  let el = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement("div");
  el.id = CONTAINER_ID;
  el.setAttribute("aria-hidden", "true");
  document.body.append(el);
  const style = document.createElement("style");
  style.textContent = `
    @media screen { #${CONTAINER_ID} { display: none !important; } }
    @media print {
      @page { margin: 0; }
      html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
      body > *:not(#${CONTAINER_ID}) { display: none !important; }
      #${CONTAINER_ID} { display: block !important; }
      #${CONTAINER_ID} img { display: block; width: 100vw; height: 100vh; object-fit: contain; break-after: page; page-break-after: always; }
      #${CONTAINER_ID} img:last-child { break-after: auto; page-break-after: auto; }
    }`;
  document.head.append(style);
  return el;
}

/** Opens the print dialog for these pages. */
export async function printPages(pages: PrintPage[]): Promise<void> {
  const el = container();
  for (const url of lastUrls) URL.revokeObjectURL(url);
  lastUrls = pages.map((p) => p.url);
  el.replaceChildren(
    ...pages.map((p) => {
      const img = document.createElement("img");
      img.src = p.url;
      img.alt = "";
      return img;
    }),
  );
  await Promise.all([...el.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
  if (platform === "macos") await invoke("print_window");
  else window.print();
}

export class PrintCancelled extends Error {}

/**
 * Prints the open PDF with its annotations. `onProgress(done, total)` while pages are drawn;
 * `cancelled()` is checked between pages.
 */
export async function printPdf(
  request: { source: string; annotations: ExportAnnotation[]; openPassword: string | null },
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean,
): Promise<void> {
  const bytes = await invoke<ArrayBuffer>("print_prepare", request);
  const task = pdfjs.getDocument({ ...documentOptions(""), url: undefined, data: new Uint8Array(bytes), password: request.openPassword ?? undefined });
  const doc = await task.promise;
  const pages: PrintPage[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      if (cancelled()) throw new PrintCancelled();
      onProgress(n - 1, doc.numPages);
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: PRINT_DPI / 72 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      canvas.width = canvas.height = 0;
      page.cleanup();
      if (blob) pages.push({ url: URL.createObjectURL(blob), landscape: viewport.width > viewport.height });
    }
    onProgress(doc.numPages, doc.numPages);
  } catch (err) {
    for (const p of pages) URL.revokeObjectURL(p.url);
    throw err;
  } finally {
    await task.destroy();
  }
  await printPages(pages);
}
