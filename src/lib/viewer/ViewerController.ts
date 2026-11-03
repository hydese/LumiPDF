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

export interface OutlineItem {
  title: string;
  depth: number;
  /** 1-based page number, or null if the entry points nowhere useful. */
  page: number | null;
  dest: string | unknown[] | null;
  children: OutlineItem[];
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
  /** Page to show once the new document's pages are laid out. */
  private pendingPage = 1;
  /** While set, the zoom follows the window size (fit width / fit page). */
  private fit: "page-width" | "page-fit" | null = "page-width";
  private fitFrame = 0;
  /** pdf.js has laid out the current document's pages (zoom can be applied). */
  private pagesReady = false;
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
      this.pagesReady = true;
      this.fit = "page-width";
      this.applyFit();
      if (this.pendingPage > 1) this.viewer.currentPageNumber = Math.min(this.pendingPage, this.doc?.numPages ?? 1);
    });
    this.eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => this.update({ page: pageNumber }));
    this.eventBus.on("scalechanging", ({ scale }: { scale: number }) => this.update({ scale }));
    this.eventBus.on("updatefindmatchescount", ({ matchesCount }: { matchesCount: { current: number; total: number } }) =>
      this.update({ findMatches: matchesCount }),
    );

    this.listen(options.container, "click", (e) => this.interceptExternalLink(e as MouseEvent), true);
    this.listen(options.container, "wheel", (e) => this.zoomWithWheel(e as WheelEvent), { passive: false });
    const resize = new ResizeObserver(() => {
      if (!this.fit) return;
      cancelAnimationFrame(this.fitFrame);
      this.fitFrame = requestAnimationFrame(() => this.applyFit());
    });
    resize.observe(options.container);
    this.cleanups.push(() => resize.disconnect());
    this.watchDevicePixelRatio();
    this.cleanups.push(onDarkModeChange(() => this.applyDarkMode()));
    this.applyDarkMode(false);
  }

  /** Shows `doc`, starting at `page` (where the reader left off). */
  setDocument(doc: PDFDocumentProxy | null, page = 1): void {
    if (doc === this.doc) return;
    this.doc = doc;
    this.pagesReady = false;
    this.pendingPage = page;
    this.findQuery = "";
    this.viewer.setDocument(doc as PDFDocumentProxy);
    this.linkService.setDocument(doc);
    this.update({ page: Math.min(page, doc?.numPages ?? 1), pages: doc?.numPages ?? 0, findMatches: null });
  }

  get document(): PDFDocumentProxy | null {
    return this.doc;
  }

  goToPage(page: number): void {
    if (!this.doc) return;
    this.viewer.currentPageNumber = Math.min(Math.max(1, Math.round(page)), this.doc.numPages);
  }

  zoomIn(): void {
    this.fit = null;
    this.viewer.increaseScale();
  }

  zoomOut(): void {
    this.fit = null;
    this.viewer.decreaseScale();
  }

  setScale(preset: ScalePreset): void {
    if (preset === "page-actual") {
      this.fit = null;
      this.viewer.currentScaleValue = preset;
    } else {
      this.fit = preset;
      this.applyFit();
    }
  }

  /**
   * Fit width/page, leaving a gutter on both sides so the page reads as a sheet on the desk
   * (pdf.js's own presets fill the window edge to edge when page borders are off).
   */
  private applyFit(): void {
    const width = this.options.container.clientWidth;
    if (!this.fit || !this.doc || !this.pagesReady || width === 0) return;
    this.viewer.currentScaleValue = this.fit;
    const room = Math.max(0.5, (width - 2 * ViewerController.GUTTER) / width);
    this.viewer.currentScale = this.viewer.currentScale * room;
  }

  private static readonly GUTTER = 32;

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

  /** Jumps to an outline entry. */
  goToDestination(dest: OutlineItem["dest"]): void {
    if (dest) void this.linkService.goToDestination(dest);
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
    this.fit = null;
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

/** The document's table of contents with page numbers (empty if it has none). */
export async function readOutline(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  const raw = (await doc.getOutline()) ?? [];
  const pageOf = async (dest: OutlineItem["dest"]): Promise<number | null> => {
    if (!dest) return null;
    try {
      const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
      const ref = explicit?.[0];
      if (ref === undefined || ref === null) return null;
      if (typeof ref === "number") return ref + 1;
      return (await doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0])) + 1;
    } catch {
      return null;
    }
  };
  const convert = async (items: typeof raw, depth: number): Promise<OutlineItem[]> =>
    Promise.all(
      items.map(async (item) => ({
        title: item.title,
        depth,
        page: await pageOf(item.dest),
        dest: item.dest,
        children: depth < 6 ? await convert(item.items ?? [], depth + 1) : [],
      })),
    );
  return convert(raw, 0);
}
