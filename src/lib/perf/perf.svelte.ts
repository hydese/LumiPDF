/**
 * BETA BUILDS ONLY: the performance panel and its log (Settings → General, shown when
 * updates.isBeta). It measures frame times while LumiPDF runs, what the viewer is drawing, and
 * writes a line every two seconds, plus every slow frame, to LumiPDF-performance.log on the
 * Desktop, so a tester can send it. Remove or keep hidden before a stable release (see
 * docs/DEVELOPMENT.md → Releasing).
 */
import { invoke } from "@tauri-apps/api/core";
import { annotations } from "../annotations/store.svelte";
import { platform } from "../platform/window";
import type { ViewerController } from "../viewer/ViewerController";

const SLOW_FRAME_MS = 80;
const SAMPLE_MS = 2000;
/** Remembers the switch between launches, so a log covers several sessions. */
const STORE_KEY = "lumipdf.perfPanel";

class PerfMonitor {
  on = $state(false);
  fps = $state(0);
  worstFrame = $state(0);
  slowFrames = $state(0);
  drawn = $state(0);
  drawing = $state(0);
  canvasMegapixels = $state(0);
  scale = $state(1);
  lastPageMs = $state(0);
  /** Where the log is written (shown in the panel), or the reason it can't be. */
  logPath = $state("");

  #viewer: ViewerController | null = null;
  #offViewer: (() => void) | null = null;
  #frame = 0;
  #timer: ReturnType<typeof setInterval> | undefined;
  #frames = 0;
  #last = 0;
  #windowStart = 0;
  #lastScroll = 0;
  #pending: string[] = [];
  #shownAt = 0;
  #onVisibility = () => {
    if (!document.hidden) this.#shownAt = performance.now();
    this.#log(document.hidden ? "window hidden (minimised, other space or app in full screen)" : "window shown");
  };

  /** The reader's viewer (or null when it closes). */
  attach(viewer: ViewerController | null): void {
    this.#offViewer?.();
    this.#offViewer = null;
    this.#viewer = viewer;
    if (!viewer) return;
    const onScroll = () => (this.#lastScroll = performance.now());
    viewer.container.addEventListener("scroll", onScroll, { passive: true });
    const offTimed = viewer.onPageTimed((page, ms) => {
      this.lastPageMs = Math.round(ms);
      if (this.on) this.#log(`page ${page} drawn in ${Math.round(ms)} ms`);
    });
    this.#offViewer = () => {
      viewer.container.removeEventListener("scroll", onScroll);
      offTimed();
    };
  }

  /** Turns the panel back on if it was on when the app last closed (beta builds only). */
  restore(): void {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORE_KEY);
    } catch {
      /* nothing remembered */
    }
    if (saved === "1") this.setOn(true);
  }

  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    try {
      localStorage.setItem(STORE_KEY, on ? "1" : "0");
    } catch {
      /* private mode: the switch just won't be remembered */
    }
    cancelAnimationFrame(this.#frame);
    clearInterval(this.#timer);
    document.removeEventListener("visibilitychange", this.#onVisibility);
    if (!on) {
      this.#flush();
      return;
    }
    this.#log(
      `--- LumiPDF ${__APP_VERSION__} · ${platform} · ${navigator.userAgent} · screen ${screen.width}×${screen.height} @${window.devicePixelRatio}x · window ${innerWidth}×${innerHeight}`,
    );
    this.#frames = 0;
    this.#last = this.#windowStart = performance.now();
    this.worstFrame = this.slowFrames = 0;
    const tick = (now: number) => {
      const gap = now - this.#last;
      this.#last = now;
      this.#frames++;
      if (gap > this.worstFrame) this.worstFrame = Math.round(gap);
      if (gap > SLOW_FRAME_MS) {
        this.slowFrames++;
        this.#log(`slow frame ${Math.round(gap)} ms · ${this.#doing()}`);
      }
      this.#frame = requestAnimationFrame(tick);
    };
    this.#frame = requestAnimationFrame(tick);
    this.#timer = setInterval(() => this.#sample(), SAMPLE_MS);
    document.addEventListener("visibilitychange", this.#onVisibility);
  }

  /** What the user and the viewer were doing (for slow frames). */
  #doing(): string {
    const parts = [`tool ${annotations.tool}`];
    if (performance.now() - this.#lastScroll < 300) parts.push("scrolling");
    if (this.drawing) parts.push(`${this.drawing} page(s) drawing`);
    if (document.fullscreenElement || (innerWidth === screen.width && innerHeight >= screen.height - 60)) parts.push("full screen");
    if (document.hidden) parts.push("window hidden");
    else if (performance.now() - this.#shownAt < 1000) parts.push("window just shown again");
    return parts.join(" · ");
  }

  #sample(): void {
    const now = performance.now();
    this.fps = Math.round((this.#frames * 1000) / Math.max(1, now - this.#windowStart));
    this.#frames = 0;
    this.#windowStart = now;
    const s = this.#viewer?.stats();
    if (s) {
      this.drawn = s.drawn;
      this.drawing = s.drawing;
      this.canvasMegapixels = Math.round(s.canvasMegapixels * 10) / 10;
      this.scale = Math.round(s.scale * 100) / 100;
    }
    this.#log(
      `${this.fps} fps · worst ${this.worstFrame} ms · ${this.slowFrames} slow · pages drawn ${this.drawn}, drawing ${this.drawing} · canvases ${this.canvasMegapixels} MP · zoom ${Math.round(this.scale * 100)}% · ${this.#doing()}`,
    );
    this.worstFrame = 0;
    this.#flush();
  }

  #log(line: string): void {
    const t = new Date();
    const stamp = `${t.toLocaleTimeString("en-GB")}.${String(t.getMilliseconds()).padStart(3, "0")}`;
    this.#pending.push(`${stamp} ${line}`);
  }

  #flush(): void {
    if (!this.#pending.length) return;
    const text = this.#pending.join("\n") + "\n";
    this.#pending = [];
    invoke<string>("perf_log", { text })
      .then((path) => (this.logPath = path))
      .catch((err) => (this.logPath = String((err as { message?: string })?.message ?? err)));
  }
}

export const perf = new PerfMonitor();
