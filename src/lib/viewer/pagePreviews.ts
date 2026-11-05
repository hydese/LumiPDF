/**
 * Instant pages: a small picture of every page, made in the background after a document opens
 * (nearest pages first) and shown under each page until pdf.js has drawn it sharp. Scrolling or
 * jumping far then shows the page at once, slightly soft for a moment, never blank or black.
 *
 * The pictures go through the same dark engine as the pages (so they match the reading theme)
 * and are made only while the reader is idle: never while scrolling or while a page is drawing.
 * About 15 KB each as JPEG: a 250-page book needs a few MB.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

/** Width of a preview in pixels (sharp enough to recognise a page while it loads). */
const PREVIEW_WIDTH = 300;
const IDLE_MS = 250;
const RETRY_MS = 150;

export interface PreviewHost {
  doc(): PDFDocumentProxy | null;
  /** The page's element in the viewer, if it exists. */
  pageDiv(page: number): HTMLElement | null;
  currentPage(): number;
  /** The reader is scrolling or a page is being drawn: wait. */
  busy(): boolean;
}

export class PagePreviews {
  #urls = new Map<number, string>();
  #doc: PDFDocumentProxy | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #generation = 0;
  #working = false;

  constructor(private readonly host: PreviewHost) {}

  /** A new document (or none): forget the old pictures and start making new ones. */
  start(doc: PDFDocumentProxy | null): void {
    this.#clear();
    this.#doc = doc;
    if (doc) this.#schedule(IDLE_MS * 2);
  }

  /** The reading theme changed: the pictures are made again in the new colours. */
  refresh(): void {
    const doc = this.#doc;
    this.#clear();
    this.#doc = doc;
    if (doc) this.#schedule(IDLE_MS);
  }

  /** Puts the picture back on pages whose element was recreated. */
  reapply(): void {
    for (const [page, url] of this.#urls) this.#show(page, url);
  }

  destroy(): void {
    this.#clear();
    this.#doc = null;
  }

  #clear(): void {
    clearTimeout(this.#timer);
    this.#generation++;
    for (const [page, url] of this.#urls) {
      const div = this.host.pageDiv(page);
      if (div) div.style.backgroundImage = "";
      URL.revokeObjectURL(url);
    }
    this.#urls.clear();
    this.#working = false;
  }

  #schedule(ms: number): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.#next(), ms);
  }

  /** The page without a picture nearest to where the reader is. */
  #pick(doc: PDFDocumentProxy): number | null {
    const current = Math.min(Math.max(1, this.host.currentPage()), doc.numPages);
    for (let d = 0; d < doc.numPages; d++) {
      for (const n of d ? [current + d, current - d] : [current]) {
        if (n >= 1 && n <= doc.numPages && !this.#urls.has(n)) return n;
      }
    }
    return null;
  }

  async #next(): Promise<void> {
    const doc = this.#doc;
    if (!doc || this.#working || doc !== this.host.doc()) return;
    if (this.host.busy()) return this.#schedule(RETRY_MS);
    const n = this.#pick(doc);
    if (n === null) return;
    const generation = this.#generation;
    this.#working = true;
    try {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PREVIEW_WIDTH / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
      canvas.width = canvas.height = 0;
      if (generation !== this.#generation || !blob) return;
      const url = URL.createObjectURL(blob);
      this.#urls.set(n, url);
      this.#show(n, url);
    } catch {
      // A page that can't be drawn small just gets no picture.
      if (generation === this.#generation) this.#urls.set(n, "");
    } finally {
      if (generation === this.#generation) {
        this.#working = false;
        this.#schedule(0);
      }
    }
  }

  #show(page: number, url: string): void {
    const div = this.host.pageDiv(page);
    if (!div || !url) return;
    div.style.backgroundImage = `url("${url}")`;
    div.style.backgroundSize = "100% 100%";
    div.style.backgroundRepeat = "no-repeat";
  }
}
