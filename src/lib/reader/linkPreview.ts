/**
 * Link previews: hovering an internal link (an equation, figure, footnote, section) shows the
 * spot it points to, drawn in the current reading theme. Clicking the preview follows the link.
 *
 * Pages that are mostly links (table of contents, index) get no previews: there the reader is
 * choosing where to go, and popups would get in the way.
 */
import type { AnnotationLayer } from "../annotations/layer";
import type { ViewerController } from "../viewer/ViewerController";
import { isDarkActive } from "../dark/engine";
import { resolveLink } from "./linkTarget";

const HOVER_DELAY_MS = 400;
const CLOSE_GRACE_MS = 160;
/** A page with this many internal links is treated as a contents/index page. */
export const TOC_LINKS = 12;
const WIDTH = 520;
const HEIGHT = 190;
/** Space shown above the target point, in preview pixels. */
const ABOVE = 34;

export class LinkPreview {
  #el: HTMLDivElement | null = null;
  #link: HTMLAnchorElement | null = null;
  #openTimer = 0;
  #closeTimer = 0;
  #token = 0;
  #cleanups: Array<() => void> = [];
  /** Horizontal extent of the text on each page, in PDF points (cached per document). */
  #columns = new Map<number, Promise<[number, number] | null>>();
  #columnsDoc: unknown = null;

  constructor(
    private readonly controller: ViewerController,
    private readonly layer: AnnotationLayer,
    private readonly enabled: () => boolean,
  ) {
    const c = controller.container;
    const over = (e: PointerEvent) => this.#onOver(e);
    const out = (e: PointerEvent) => this.#onOut(e);
    const close = () => this.close();
    c.addEventListener("pointerover", over);
    c.addEventListener("pointerout", out);
    c.addEventListener("scroll", close, { passive: true });
    c.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    window.addEventListener("blur", close);
    this.#cleanups.push(() => {
      c.removeEventListener("pointerover", over);
      c.removeEventListener("pointerout", out);
      c.removeEventListener("scroll", close);
      c.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("blur", close);
    });
    this.#cleanups.push(controller.onScaleChanged(close));
  }

  destroy(): void {
    this.close();
    for (const off of this.#cleanups) off();
  }

  close(): void {
    clearTimeout(this.#openTimer);
    clearTimeout(this.#closeTimer);
    this.#token++;
    this.#link = null;
    this.#el?.remove();
    this.#el = null;
  }

  #linkFrom(target: EventTarget | null): HTMLAnchorElement | null {
    const el = target instanceof Element ? target : null;
    const link = el?.closest<HTMLAnchorElement>(".annotationLayer [data-internal-link] a[href]");
    return link && this.controller.container.contains(link) ? link : null;
  }

  #onOver(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    const link = this.#linkFrom(e.target);
    if (!link) return;
    clearTimeout(this.#closeTimer);
    if (link === this.#link) return;
    this.close();
    if (!this.enabled() || isContentsPage(link)) return;
    this.#link = link;
    const token = this.#token;
    this.#openTimer = window.setTimeout(() => void this.#open(link, token), HOVER_DELAY_MS);
  }

  #onOut(e: PointerEvent): void {
    if (!this.#link) return;
    const to = e.relatedTarget as Node | null;
    if (to && (this.#link.contains(to) || this.#el?.contains(to))) return;
    this.#scheduleClose();
  }

  #scheduleClose(): void {
    clearTimeout(this.#closeTimer);
    this.#closeTimer = window.setTimeout(() => this.close(), CLOSE_GRACE_MS);
  }

  async #open(link: HTMLAnchorElement, token: number): Promise<void> {
    const doc = this.controller.document;
    if (!doc) return;
    const target = await resolveLink(doc, link.getAttribute("href") ?? "");
    if (!target || token !== this.#token) return;
    const view = this.controller.pageView(target.page);
    if (!view) return;
    const vp = view.viewport;
    const width = Math.min(WIDTH, window.innerWidth - 32);
    // Crop to the text column (margins would make everything small).
    const column = await this.#column(doc, target.page);
    if (token !== this.#token) return;
    let left = 0;
    let span = vp.width;
    if (column) {
      const a = vp.convertToViewportPoint(column[0], 0)[0];
      const b = vp.convertToViewportPoint(column[1], 0)[0];
      const pad = 0.025 * vp.width;
      left = Math.max(0, Math.min(a, b) - pad);
      span = Math.min(vp.width - left, Math.abs(b - a) + 2 * pad);
      if (span < vp.width * 0.4) {
        // Very narrow text (a lone equation): centre a wider window on it.
        const mid = left + span / 2;
        span = vp.width * 0.4;
        left = Math.max(0, Math.min(vp.width - span, mid - span / 2));
      }
    }
    const k = width / span; // preview pixels per page pixel (current zoom)
    const pageHeight = vp.convertToPdfPoint(0, 0)[1];
    const [, ty] = vp.convertToViewportPoint(target.x ?? 0, target.y ?? pageHeight);
    const top = Math.max(0, Math.min(ty - ABOVE / k, vp.height - HEIGHT / k));
    const rect = { left, top, width: span, height: Math.min(HEIGHT / k, vp.height - top) };

    const el = this.#frame(link, width, rect.height * k);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const canvas = await this.layer.renderRegion(target.page, rect, k * dpr).catch(() => null);
    if (!canvas || token !== this.#token) return;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${rect.height * k}px`;
    el.querySelector(".lumi-link-body")?.replaceChildren(canvas);
    el.classList.add("ready");
  }

  #column(doc: import("pdfjs-dist").PDFDocumentProxy, page: number): Promise<[number, number] | null> {
    if (this.#columnsDoc !== doc) {
      this.#columns.clear();
      this.#columnsDoc = doc;
    }
    let found = this.#columns.get(page);
    if (!found) {
      found = doc
        .getPage(page)
        .then((p) => p.getTextContent())
        .then((content) => {
          let min = Infinity;
          let max = -Infinity;
          for (const item of content.items) {
            if (!("transform" in item) || !item.str.trim()) continue;
            const x = item.transform[4] as number;
            min = Math.min(min, x);
            max = Math.max(max, x + item.width);
          }
          return Number.isFinite(min) && max > min ? ([min, max] as [number, number]) : null;
        })
        .catch(() => null);
      this.#columns.set(page, found);
    }
    return found;
  }

  /** The popup box, placed below the link (or above, if there's no room). */
  #frame(link: HTMLAnchorElement, width: number, height: number): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "lumi-link-preview";
    el.classList.toggle("dark", isDarkActive());
    el.setAttribute("role", "button");
    el.tabIndex = -1;
    const body = document.createElement("div");
    body.className = "lumi-link-body";
    body.style.width = `${width}px`;
    body.style.height = `${height}px`;
    el.append(body);
    const r = link.getBoundingClientRect();
    const margin = 8;
    const below = r.bottom + margin + height + 2 <= window.innerHeight - 8;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 10);
    Object.assign(el.style, {
      left: `${left}px`,
      top: below ? `${r.bottom + margin}px` : `${Math.max(8, r.top - margin - height - 2)}px`,
    });
    el.addEventListener("pointerenter", () => clearTimeout(this.#closeTimer));
    el.addEventListener("pointerleave", () => this.#scheduleClose());
    el.addEventListener("click", () => {
      link.click();
      this.close();
    });
    // Inside the reader so it picks up the reader's colours (light or dark).
    (this.controller.container.closest(".screen") ?? document.body).append(el);
    this.#el = el;
    return el;
  }
}

/** True on contents/index pages: many internal links on the link's page. */
function isContentsPage(link: Element): boolean {
  const layer = link.closest(".annotationLayer");
  return !!layer && layer.querySelectorAll("[data-internal-link]").length >= TOC_LINKS;
}
