/**
 * Owns one pdf.js PDFViewer and the services around it (event bus, links, find).
 * Components talk to this class only; nothing else imports pdf_viewer.mjs.
 */
// pdf_viewer.mjs reads the core library from globalThis.pdfjsLib, so ./pdfjs (which loads it)
// must be evaluated first. Keep this import above the pdf_viewer.mjs import.
import { PDFJS_ASSETS } from "./pdfjs";
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { darkBackground, onDarkModeChange } from "../dark/engine";

export type ScalePreset = "page-width" | "page-fit" | "page-actual";

export interface ViewerState {
  page: number;
  pages: number;
  /** Zoom factor, 1 = 100%. */
  scale: number;
  findMatches: { current: number; total: number } | null;
}

export interface ViewerOptions {
  container: HTMLDivElement;
  onState: (state: ViewerState) => void;
  /** Called for http(s)/mailto links in the document; never navigates the app window. */
  onExternalLink: (url: string) => void;
}

const SAFE_EXTERNAL_LINK = /^(https?:|mailto:)/i;

export class ViewerController {
  private readonly eventBus = new EventBus();
  private readonly linkService: PDFLinkService;
  private readonly findController: PDFFindController;
  private readonly viewer: PDFViewer;
  private readonly options: ViewerOptions;
  private doc: PDFDocumentProxy | null = null;
  private findQuery = "";
  private readonly cleanups: Array<() => void> = [];
  private state: ViewerState = { page: 1, pages: 0, scale: 1, findMatches: null };

  constructor(options: ViewerOptions) {
    this.options = options;
    this.linkService = new PDFLinkService({ eventBus: this.eventBus });
    this.findController = new PDFFindController({ eventBus: this.eventBus, linkService: this.linkService });
    this.viewer = new PDFViewer({
      container: options.container,
      eventBus: this.eventBus,
      linkService: this.linkService,
      findController: this.findController,
      imageResourcesPath: `${PDFJS_ASSETS}images/`,
      removePageBorders: true,
    });
    this.linkService.setViewer(this.viewer);

    this.eventBus.on("pagesinit", () => {
      this.viewer.currentScaleValue = "page-width";
    });
    this.eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => this.update({ page: pageNumber }));
    this.eventBus.on("scalechanging", ({ scale }: { scale: number }) => this.update({ scale }));
    this.eventBus.on("updatefindmatchescount", ({ matchesCount }: { matchesCount: { current: number; total: number } }) =>
      this.update({ findMatches: matchesCount }),
    );

    this.listen(options.container, "click", (e) => this.interceptExternalLink(e as MouseEvent), true);
    this.listen(options.container, "wheel", (e) => this.zoomWithWheel(e as WheelEvent), { passive: false });
    this.watchDevicePixelRatio();
    this.cleanups.push(onDarkModeChange(() => this.applyDarkMode()));
    this.applyDarkMode(false);
  }

  setDocument(doc: PDFDocumentProxy | null): void {
    this.doc = doc;
    this.findQuery = "";
    this.viewer.setDocument(doc as PDFDocumentProxy);
    this.linkService.setDocument(doc);
    this.update({ page: 1, pages: doc?.numPages ?? 0, findMatches: null });
  }

  get document(): PDFDocumentProxy | null {
    return this.doc;
  }

  goToPage(page: number): void {
    if (!this.doc) return;
    this.viewer.currentPageNumber = Math.min(Math.max(1, Math.round(page)), this.doc.numPages);
  }

  zoomIn(): void {
    this.viewer.increaseScale();
  }

  zoomOut(): void {
    this.viewer.decreaseScale();
  }

  setScale(preset: ScalePreset): void {
    this.viewer.currentScaleValue = preset;
  }

  /** Highlights all matches of `query` and moves to the next (or previous) one. */
  find(query: string, previous = false): void {
    const again = query === this.findQuery;
    this.findQuery = query;
    this.eventBus.dispatch("find", {
      source: this,
      type: again ? "again" : "",
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false,
    });
  }

  clearFind(): void {
    this.findQuery = "";
    this.eventBus.dispatch("findbarclose", { source: this });
    this.update({ findMatches: null });
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.setDocument(null);
  }

  /** Paints the page background in the reading theme and re-renders every page. */
  private applyDarkMode(rerender = true): void {
    const bg = darkBackground();
    this.options.container.style.setProperty("--page-bg", bg ?? "#ffffff");
    this.options.container.classList.toggle("reading-dark", bg !== null);
    if (rerender && this.doc) this.viewer.refresh();
  }

  private update(patch: Partial<ViewerState>): void {
    this.state = { ...this.state, ...patch };
    this.options.onState(this.state);
  }

  private listen(target: EventTarget, type: string, handler: (e: Event) => void, options?: AddEventListenerOptions | boolean): void {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  private interceptExternalLink(event: MouseEvent): void {
    const anchor = (event.target as Element | null)?.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#")) return; // internal destination, handled by pdf.js
    event.preventDefault();
    event.stopPropagation();
    if (SAFE_EXTERNAL_LINK.test(href)) this.options.onExternalLink(href);
  }

  private zoomWithWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const origin: [number, number] = [event.clientX, event.clientY];
    if (event.deltaY < 0) this.viewer.increaseScale({ origin, drawingDelay: 150 });
    else this.viewer.decreaseScale({ origin, drawingDelay: 150 });
  }

  /** Re-render at the new pixel density when the window moves to a monitor with other scaling. */
  private watchDevicePixelRatio(): void {
    let query: MediaQueryList | null = null;
    const onChange = () => {
      query?.removeEventListener("change", onChange);
      this.viewer.refresh();
      watch();
    };
    const watch = () => {
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener("change", onChange);
    };
    watch();
    this.cleanups.push(() => query?.removeEventListener("change", onChange));
  }
}
