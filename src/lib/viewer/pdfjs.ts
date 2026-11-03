/**
 * pdf.js setup shared by the viewer and, later, thumbnails and the formula sheet builder.
 */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Data files copied into public/pdfjs by scripts/copy-pdfjs-assets.mjs. */
export const PDFJS_ASSETS = "/pdfjs/";

/** pdf.js loading options shared by every document LumiPDF opens. */
export function documentOptions(url: string) {
  return {
    url,
    cMapUrl: `${PDFJS_ASSETS}cmaps/`,
    standardFontDataUrl: `${PDFJS_ASSETS}standard_fonts/`,
    wasmUrl: `${PDFJS_ASSETS}wasm/`,
    iccUrl: `${PDFJS_ASSETS}iccs/`,
    enableXfa: false,
  };
}

export type PasswordPrompt = (retry: boolean) => Promise<string | null>;

export class PasswordCancelledError extends Error {
  constructor() {
    super("Password entry was cancelled");
  }
}

/**
 * Opens a PDF from a URL. pdf.js fetches it in chunks with HTTP range requests, so large files
 * start displaying before they are fully read.
 */
export interface LoadedPdf {
  doc: pdfjs.PDFDocumentProxy;
  /** Frees the worker-side document. Call when the document is closed. */
  close: () => Promise<void>;
}

export async function loadDocument(url: string, askPassword: PasswordPrompt): Promise<LoadedPdf> {
  // Imported lazily to avoid a module cycle (the engine imports this file for `pdfjs`).
  const { RecolorCanvasFactory, attachToDocument, installPdfjsHooks } = await import("../dark/engine");
  await installPdfjsHooks();
  const task = pdfjs.getDocument({ ...documentOptions(url), CanvasFactory: RecolorCanvasFactory });
  task.onPassword = (update: (password: string) => void, reason: number) => {
    const retry = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
    void askPassword(retry).then((password) => {
      if (password === null) {
        void task.destroy();
      } else {
        update(password);
      }
    });
  };
  try {
    const doc = await task.promise;
    attachToDocument(doc);
    return { doc, close: () => task.destroy() };
  } catch (err) {
    if (task.destroyed) throw new PasswordCancelledError();
    throw err;
  }
}

export { pdfjs };
