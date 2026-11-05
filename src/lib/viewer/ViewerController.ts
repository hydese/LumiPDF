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
  /** The page a followed link came from, while "Back" can return there. */
  backPage: number | null;
}

/** Where the reader is in a document: page, zoom, and how far down that page. */
export interface ReadingPlace {
  page: number;
  /** A fit mode, or a fixed zoom factor. */
  zoom: "page-width" | "page-fit" | number;
  /** 0..1: how far the top of the window is into the page. */
  offset: number;
}

/** The parts of a pdf.js page view the annotation layer uses. */
export interface PageViewLike {
  id: number;
  div: HTMLDivElement;
  viewport: {
    scale: number;
    width: number;
    height: number;
    convertToViewportPoint(x: number, y: number): [number, number];
    convertToPdfPoint(x: number, y: number): [number, number];
  };
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
  /** Called once after a newly set document has drawn its first page. */
  onFirstRender?: () => void;
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
  /** Place to restore once the new document's pages are laid out. */
  private pendingPlace: ReadingPlace = { page: 1, zoom: "page-width", offset: 0 };
  private awaitingFirstRender = false;
  /** While set, the zoom follows the window size (fit width / fit page). */
  private fit: "page-width" | "page-fit" | null = "page-width";
  private fitTimer: ReturnType<typeof setTimeout> | undefined;
  private aheadTimer: ReturnType<typeof setTimeout> | undefined;
  private lastScroll = 0;
  private static readonly RESIZE_SETTLE_MS = 160;
  /** Pages drawn ahead of and behind the visible ones while idle, so they aren't blank. */
  private static readonly AHEAD = 2;
  private static readonly BEHIND = 1;
  /** pdf.js has laid out the current document's pages (zoom can be applied). */
  private pagesReady = false;
  private readonly cleanups: Array<() => void> = [];
  private state: ViewerState = { page: 1, pages: 0, scale: 1, findMatches: null, backPage: null };
  /** Places left by following links, newest last. */
  private backStack: ReadingPlace[] = [];

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
      this.restorePlace(this.pendingPlace);
    });
    this.eventBus.on("pagerendered", () => {
      this.scheduleRenderAhead();
      if (!this.awaitingFirstRender) return;
      this.awaitingFirstRender = false;
      this.options.onFirstRender?.();
    });
    this.eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => this.update({ page: pageNumber }));
    this.eventBus.on("scalechanging", ({ scale }: { scale: number }) => this.update({ scale }));
    this.eventBus.on("updatefindmatchescount", ({ matchesCount }: { matchesCount: { current: number; total: number } }) =>
      this.update({ findMatches: matchesCount }),
    );

    this.listen(options.container, "click", (e) => this.interceptExternalLink(e as MouseEvent), true);
    this.listen(options.container, "wheel", (e) => this.zoomWithWheel(e as WheelEvent), { passive: false });
    // WebKit also sends its own pinch gestures; the wheel events above already handle the zoom.
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      this.listen(options.container, type, (e) => e.preventDefault(), { passive: false });
    }
    this.cleanups.push(() => clearTimeout(this.pinch?.timer));
    // Fit-to-window zoom follows resizes once they settle: re-zooming (and so redrawing every
    // page) on each frame of a window drag or of the macOS full-screen animation made them laggy.
    const resize = new ResizeObserver(() => {
      if (!this.fit) return;
      clearTimeout(this.fitTimer);
      this.fitTimer = setTimeout(() => this.applyFit(false), this.pagesReady ? ViewerController.RESIZE_SETTLE_MS : 0);
    });
    resize.observe(options.container);
    this.cleanups.push(() => {
      resize.disconnect();
      clearTimeout(this.fitTimer);
      clearTimeout(this.aheadTimer);
    });
    this.listen(options.container, "scroll", () => (this.lastScroll = performance.now()));
    this.watchDevicePixelRatio();
    this.cleanups.push(onDarkModeChange(() => this.applyDarkMode()));
    this.applyDarkMode(false);
  }

  /** Shows `doc` at `place` (a page number, or the exact place a tab was left at). */
  setDocument(doc: PDFDocumentProxy | null, place: number | ReadingPlace = 1): void {
    if (doc === this.doc) return;
    this.doc = doc;
    this.pagesReady = false;
    this.awaitingFirstRender = doc !== null;
    this.pendingPlace = typeof place === "number" ? { page: place, zoom: "page-width", offset: 0 } : place;
    this.findQuery = "";
    this.viewer.setDocument(doc as PDFDocumentProxy);
    this.linkService.setDocument(doc);
    const page = Math.min(this.pendingPlace.page, doc?.numPages ?? 1);
    this.backStack = [];
    this.update({ page, pages: doc?.numPages ?? 0, findMatches: null, backPage: null });
  }

  /** The scrolling element that holds the pages. */
  get container(): HTMLDivElement {
    return this.options.container;
  }

  /** Page view of a 1-based page number (exists for every page, drawn or not). */
  pageView(page: number): PageViewLike | null {
    return (this.viewer.getPageView(page - 1) as unknown as PageViewLike | undefined) ?? null;
  }

  /**
   * Calls `handler` each time a page finishes drawing (after zoom, scrolling into view…).
   * At high zoom pdf.js also draws a sharper "detail" view of the visible area and reports that
   * with the detail view as source; the handler always receives the page itself.
   */
  onPageRendered(handler: (view: PageViewLike) => void): () => void {
    const listener = ({ pageNumber }: { pageNumber: number }) => {
      const view = this.pageView(pageNumber);
      if (view?.div) handler(view);
    };
    this.eventBus.on("pagerendered", listener);
    return () => this.eventBus.off("pagerendered", listener);
  }

  /** Beta performance panel: what the viewer is doing now. */
  stats(): { drawn: number; drawing: number; canvasMegapixels: number; scale: number } {
    const views = (this.viewer as unknown as { _pages: Array<{ renderingState: number }> })._pages ?? [];
    let drawn = 0;
    let drawing = 0;
    for (const v of views) {
      if (v.renderingState === 3) drawn++;
      else if (v.renderingState === 1 || v.renderingState === 2) drawing++;
    }
    let pixels = 0;
    for (const c of this.options.container.querySelectorAll("canvas")) pixels += c.width * c.height;
    return { drawn, drawing, canvasMegapixels: pixels / 1e6, scale: this.viewer.currentScale };
  }

  /** Beta performance panel: how long each page took to draw. */
  onPageTimed(handler: (page: number, ms: number) => void): () => void {
    const started = new Map<number, number>();
    const start = ({ pageNumber }: { pageNumber: number }) => started.set(pageNumber, performance.now());
    const end = ({ pageNumber }: { pageNumber: number }) => {
      const t = started.get(pageNumber);
      if (t === undefined) return;
      started.delete(pageNumber);
      handler(pageNumber, performance.now() - t);
    };
    this.eventBus.on("pagerender", start);
    this.eventBus.on("pagerendered", end);
    return () => {
      this.eventBus.off("pagerender", start);
      this.eventBus.off("pagerendered", end);
    };
  }

  /** Calls `handler` after the zoom changes (pages may not be drawn again yet). */
  onScaleChanged(handler: () => void): () => void {
    const listener = () => handler();
    this.eventBus.on("scalechanging", listener);
    return () => this.eventBus.off("scalechanging", listener);
  }

  /** Where the reader is now, to come back to it later (tabs). */
  place(): ReadingPlace {
    const page = this.viewer.currentPageNumber || 1;
    const div = this.viewer.getPageView(page - 1)?.div as HTMLElement | undefined;
    const top = this.options.container.scrollTop;
    const offset = div && div.clientHeight ? Math.min(1, Math.max(0, (top - div.offsetTop) / div.clientHeight)) : 0;
    return { page, zoom: this.fit ?? this.viewer.currentScale, offset };
  }

  /**
   * A picture of what's on screen now (the visible page canvases), shown while a sleeping tab
   * wakes up. Returns an object URL, or null if nothing is drawn.
   */
  async snapshot(): Promise<string | null> {
    const box = this.options.container.getBoundingClientRect();
    if (!this.doc || box.width === 0 || box.height === 0) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const out = document.createElement("canvas");
    out.width = Math.round(box.width * dpr);
    out.height = Math.round(box.height * dpr);
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    let drew = false;
    for (const canvas of this.options.container.querySelectorAll<HTMLCanvasElement>(".page canvas")) {
      const r = canvas.getBoundingClientRect();
      if (r.bottom < box.top || r.top > box.bottom || r.width === 0) continue;
      ctx.drawImage(canvas, (r.left - box.left) * dpr, (r.top - box.top) * dpr, r.width * dpr, r.height * dpr);
      drew = true;
    }
    if (!drew) return null;
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/webp", 0.8));
    return blob ? URL.createObjectURL(blob) : null;
  }

  private restorePlace(place: ReadingPlace): void {
    const pages = this.doc?.numPages ?? 1;
    if (typeof place.zoom === "number") {
      this.fit = null;
      this.viewer.currentScale = place.zoom;
    } else {
      this.fit = place.zoom;
      this.applyFit();
    }
    const page = Math.min(Math.max(1, place.page), pages);
    if (page > 1 || place.offset > 0) {
      this.viewer.currentPageNumber = page;
      const div = this.viewer.getPageView(page - 1)?.div as HTMLElement | undefined;
      if (div) this.options.container.scrollTop = div.offsetTop + place.offset * div.clientHeight;
    }
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
  private applyFit(force = true): void {
    const width = this.options.container.clientWidth;
    if (!this.fit || !this.doc || !this.pagesReady || width === 0) return;
    // A resize that left the window the same size must not re-zoom: setting the preset and then
    // the gutter scale makes pdf.js throw away and redraw every visible page.
    const size = `${this.fit}:${width}x${this.options.container.clientHeight}:${this.viewer.currentScale}`;
    if (!force && size === this.fitSize) return;
    this.viewer.currentScaleValue = this.fit;
    const room = Math.max(0.5, (width - 2 * ViewerController.GUTTER) / width);
    this.viewer.currentScale = this.viewer.currentScale * room;
    this.fitSize = `${this.fit}:${width}x${this.options.container.clientHeight}:${this.viewer.currentScale}`;
  }

  private fitSize = "";

  private static readonly GUTTER = 32;

  /**
   * pdf.js draws the visible pages and one more in the scroll direction; scrolling further shows
   * blank pages until they're drawn. When nothing else is drawing and the reader isn't scrolling,
   * draw a couple more pages around the visible ones, one at a time.
   */
  private scheduleRenderAhead(): void {
    clearTimeout(this.aheadTimer);
    this.aheadTimer = setTimeout(() => void this.renderAhead(), 120);
  }

  /**
   * pdf.js keeps the last ten drawn pages. Zoomed in on a high-density screen that is ~200
   * megapixels of canvas, and the system pauses the app to reclaim it. Over the budget, drop the
   * drawn pages farthest from the reader (never the ones around the current page).
   */
  private trimMemory(): void {
    type View = { id: number; renderingState: number; div: HTMLElement; reset(): void };
    const views = (this.viewer as unknown as { _pages?: View[] })._pages ?? [];
    const current = this.viewer.currentPageNumber || 1;
    const FINISHED = 3;
    const drawn = views
      .filter((v) => v.renderingState === FINISHED)
      .map((v) => {
        const c = v.div.querySelector<HTMLCanvasElement>(".canvasWrapper canvas");
        return { v, pixels: c ? c.width * c.height : 0, distance: Math.abs(v.id - current) };
      })
      .sort((a, b) => b.distance - a.distance);
    let total = drawn.reduce((sum, d) => sum + d.pixels, 0);
    for (const d of drawn) {
      if (total <= ViewerController.CANVAS_BUDGET) break;
      if (d.v.id >= current - ViewerController.BEHIND - 1 && d.v.id <= current + ViewerController.AHEAD + 1) continue;
      d.v.reset();
      total -= d.pixels;
    }
  }

  private static readonly CANVAS_BUDGET = 90e6;

  private async renderAhead(): Promise<void> {
    const doc = this.doc;
    if (!doc || !this.pagesReady) return;
    this.trimMemory();
    if (performance.now() - this.lastScroll < 250) return this.scheduleRenderAhead();
    type View = { id: number; renderingState: number; pdfPage: unknown; setPdfPage(p: unknown): void };
    const viewer = this.viewer as unknown as { _pages: View[]; renderingQueue: { renderView(v: View): boolean } };
    const RUNNING = 1;
    const INITIAL = 0;
    if (viewer._pages.some((v) => v.renderingState === RUNNING)) return; // pdf.js is busy; it calls us again
    const current = this.viewer.currentPageNumber || 1;
    const order: number[] = [];
    for (let i = 1; i <= ViewerController.AHEAD; i++) order.push(current + i);
    for (let i = 1; i <= ViewerController.BEHIND; i++) order.push(current - i);
    for (const n of order) {
      const view = viewer._pages[n - 1];
      if (!view || view.renderingState !== INITIAL) continue;
      if (!view.pdfPage) {
        const page = await doc.getPage(n);
        if (doc !== this.doc) return;
        if (!view.pdfPage) view.setPdfPage(page);
      }
      viewer.renderingQueue.renderView(view); // its "pagerendered" schedules the next one
      return;
    }
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

  /** Jumps to an outline entry. */
  goToDestination(dest: OutlineItem["dest"]): void {
    if (!dest) return;
    this.rememberPlace();
    void this.linkService.goToDestination(dest);
  }

  /** Remembers where the reader is before a link jump, so "Back" can return. */
  private rememberPlace(): void {
    if (!this.doc) return;
    const here = this.place();
    const last = this.backStack.at(-1);
    if (last && last.page === here.page && Math.abs(last.offset - here.offset) < 0.02) return;
    this.backStack.push(here);
    if (this.backStack.length > ViewerController.BACK_LIMIT) this.backStack.shift();
    this.update({ backPage: here.page });
  }

  private static readonly BACK_LIMIT = 30;

  /** Returns to where the last followed link was clicked (keeping the current zoom). */
  goBack(): boolean {
    const place = this.backStack.pop();
    if (!place || !this.doc) return false;
    const page = Math.min(Math.max(1, place.page), this.doc.numPages);
    this.viewer.currentPageNumber = page;
    const div = this.viewer.getPageView(page - 1)?.div as HTMLElement | undefined;
    if (div) this.options.container.scrollTop = div.offsetTop + place.offset * div.clientHeight;
    this.update({ backPage: this.backStack.at(-1)?.page ?? null });
    return true;
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
    if (href.startsWith("#")) {
      this.rememberPlace(); // internal destination, handled by pdf.js
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (SAFE_EXTERNAL_LINK.test(href)) this.options.onExternalLink(href);
  }

  /**
   * Ctrl/⌘ + wheel and trackpad pinch. While the gesture runs the pages are only stretched with a
   * CSS transform (free, no redraw); the real zoom, and one sharp redraw, happens when it pauses.
   * Pinch deltas are small and many, so they scale smoothly; a mouse wheel notch is one 10% step.
   */
  private zoomWithWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const notch = event.deltaMode !== 0 || Math.abs(event.deltaY) >= 40;
    const step = notch ? (event.deltaY < 0 ? 1.1 : 1 / 1.1) : Math.exp(-event.deltaY * ViewerController.PINCH_SPEED);
    this.stretchZoom(step, event.clientX, event.clientY);
  }

  private static readonly PINCH_SPEED = 0.006;
  private static readonly ZOOM_MIN = 0.1;
  private static readonly ZOOM_MAX = 10;
  private pinch: { factor: number; x: number; y: number; cx: number; cy: number; timer: ReturnType<typeof setTimeout> | undefined } | null = null;

  private stretchZoom(step: number, clientX: number, clientY: number): void {
    const el = this.viewer.viewer as HTMLElement | null;
    if (!el || !this.doc) return;
    const current = this.viewer.currentScale;
    if (!this.pinch) {
      const box = el.getBoundingClientRect();
      this.pinch = { factor: 1, x: clientX - box.left, y: clientY - box.top, cx: clientX, cy: clientY, timer: undefined };
      el.style.transformOrigin = `${this.pinch.x}px ${this.pinch.y}px`;
    }
    const pinch = this.pinch;
    const target = Math.min(ViewerController.ZOOM_MAX, Math.max(ViewerController.ZOOM_MIN, current * pinch.factor * step));
    pinch.factor = target / current;
    el.style.transform = `scale(${pinch.factor})`;
    clearTimeout(pinch.timer);
    pinch.timer = setTimeout(() => this.commitZoom(), ViewerController.PINCH_SETTLE_MS);
  }

  private static readonly PINCH_SETTLE_MS = 140;

  private commitZoom(): void {
    const pinch = this.pinch;
    this.pinch = null;
    const el = this.viewer.viewer as HTMLElement | null;
    if (!pinch || !el) return;
    el.style.transform = "";
    el.style.transformOrigin = "";
    if (Math.abs(pinch.factor - 1) < 0.005) return;
    this.fit = null;
    this.viewer.updateScale({ scaleFactor: pinch.factor, origin: [pinch.cx, pinch.cy], drawingDelay: 0 });
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
