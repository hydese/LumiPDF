/**
 * BETA BUILDS ONLY — photo training. In dark mode a tester right-clicks an image and says
 * "It's a photo" or "Not a photo". The correction applies at once and is remembered on this
 * computer; the example (original, dark version as it was, features, model's answer, context)
 * goes to the "LumiPDF-esempi" folder on the Desktop, to be sent and added to the photo
 * model's dataset (private lab repository) so the next version gets it right for everyone.
 *
 * Remove the menu before a stable release (docs/DEVELOPMENT.md, "Beta-only").
 */
import { invoke } from "@tauri-apps/api/core";
import { darkVersionOf, refreshDarkImages } from "./engine";
import { describeImage, setPhotoOverrides } from "./images";
import { spotAt, type ImageSpot } from "./imageSpots";
import { FEATURE_NAMES } from "./photoFeatures";

const STORE_KEY = "lumipdf.photoOverrides";
const ON_KEY = "lumipdf.photoTraining";
const MAX_REMEMBERED = 1000;
const ORIGINAL_MAX = 800;

export interface PhotoTarget {
  at: { x: number; y: number };
  spot: ImageSpot;
  page: number;
  /** The app's current judgement: photo (kept) or not. */
  photo: boolean;
}

function load(): Array<[string, boolean]> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((e): e is [string, boolean] => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "boolean") : [];
  } catch {
    return [];
  }
}

/** Settings → Beta: the right-click menu on/off, and the corrections remembered here. */
class PhotoTraining {
  on = $state(true);
  count = $state(0);

  restore(): void {
    try {
      this.on = localStorage.getItem(ON_KEY) !== "0";
    } catch {
      /* on */
    }
    const saved = load();
    this.count = saved.length;
    if (saved.length) setPhotoOverrides(saved);
  }

  setOn(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem(ON_KEY, on ? "1" : "0");
    } catch {
      /* this session only */
    }
  }

  /** Forgets this computer's corrections: the model decides again. */
  forget(): void {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* nothing stored */
    }
    this.count = 0;
    setPhotoOverrides([]);
    refreshDarkImages();
  }
}

export const photoTraining = new PhotoTraining();

/** Applies the corrections remembered on this computer (call once at start). */
export function restorePhotoOverrides(): void {
  photoTraining.restore();
}

/** The image under the pointer in a page canvas, if any. */
export function photoTargetAt(event: MouseEvent): PhotoTarget | null {
  if (!photoTraining.on) return null;
  for (const el of document.elementsFromPoint(event.clientX, event.clientY)) {
    if (!(el instanceof HTMLCanvasElement) || !el.closest(".page")) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const spot = spotAt(el, ((event.clientX - r.left) * el.width) / r.width, ((event.clientY - r.top) * el.height) / r.height);
    const source = spot?.source.deref() as CanvasImageSource | undefined;
    if (!spot || !source) continue;
    const info = describeImage(source);
    if (!info) continue;
    const page = Number(el.closest(".page")?.getAttribute("data-page-number") ?? 0);
    return { at: { x: event.clientX, y: event.clientY }, spot, page, photo: info.override ?? info.probability >= 0.5 };
  }
  return null;
}

function png(source: CanvasImageSource, width: number, height: number, max: number): Promise<Uint8Array> {
  const s = Math.min(1, max / Math.max(width, height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width * s));
  c.height = Math.max(1, Math.round(height * s));
  try {
    c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  } catch {
    /* the image is gone: an empty picture */
  }
  return new Promise((resolve) => c.toBlob((b) => void (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a))) : resolve(new Uint8Array())), "image/png"));
}

/**
 * The tester's answer: remembered and applied now, and the example saved to the Desktop.
 * Resolves to the folder's path.
 */
export async function teach(target: PhotoTarget, photo: boolean, context: { document: string; version: string }): Promise<string> {
  const source = target.spot.source.deref() as CanvasImageSource | undefined;
  if (!source) throw new Error("image no longer on screen");
  const info = describeImage(source)!;
  // Before applying: the original and the dark version the tester saw.
  const original = await png(source, info.width, info.height, ORIGINAL_MAX);
  const darkSource = darkVersionOf(source) ?? source;
  const dark = await png(darkSource, info.width, info.height, ORIGINAL_MAX);

  const saved = new Map(load());
  saved.delete(info.key);
  saved.set(info.key, photo);
  const entries = [...saved].slice(-MAX_REMEMBERED);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  } catch {
    /* still applied for this session */
  }
  setPhotoOverrides(entries);
  photoTraining.count = entries.length;
  refreshDarkImages();

  const record = {
    label: photo ? "photo" : "not-photo",
    // The line to add to the photo model's dataset:
    dataset: { from: `${context.document} p${target.page} (tester)`, photo, reported: true, f: info.features.map((v) => +v.toFixed(4)) },
    model: { probability: +info.probability.toFixed(3), saidPhoto: info.probability >= 0.5, rules: info.rules, previousOverride: info.override },
    features: Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, +info.features[i]!.toFixed(4)])),
    image: { width: info.width, height: info.height, key: info.key },
    context: { ...context, page: target.page, platform: navigator.userAgent, savedAt: new Date().toISOString() },
  };
  return invoke<string>("save_photo_example", { photo, original: [...original], dark: [...dark], info: JSON.stringify(record, null, 2) });
}
