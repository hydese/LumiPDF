/**
 * First-page thumbnails for the Library, in the document's original colours.
 *
 * Rendered with a plain pdf.js document (no dark engine), at most two at a time, and cached in
 * IndexedDB keyed by path, size and modification time, so each file is rendered once until it
 * changes. Cloud-only files are skipped: reading them would download them.
 */
import { convertFileSrc } from "@tauri-apps/api/core";
import type { FileEntry } from "../ipc/library";
import { documentOptions, pdfjs } from "../viewer/pdfjs";

const THUMB_HEIGHT = 320;
const CONCURRENCY = 2;
const DB_NAME = "lumipdf-thumbnails";
const STORE = "thumbs";

const urls = new Map<string, Promise<string | null>>();
const queue: Array<() => Promise<void>> = [];
let running = 0;

function keyOf(file: FileEntry): string {
  return `${file.path}|${file.size}|${file.modified}`;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function cached(key: string): Promise<Blob | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    const request = d.transaction(STORE).objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => resolve(null);
  });
}

async function store(key: string, blob: Blob): Promise<void> {
  const d = await db();
  if (!d) return;
  d.transaction(STORE, "readwrite").objectStore(STORE).put(blob, key);
}

async function render(file: FileEntry): Promise<Blob | null> {
  const task = pdfjs.getDocument({ ...documentOptions(convertFileSrc(file.path)), disableAutoFetch: true });
  task.onPassword = () => void task.destroy(); // protected: no thumbnail
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMB_HEIGHT / base.height });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport, background: "#ffffff" }).promise;
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  } catch {
    return null;
  } finally {
    void task.destroy();
  }
}

function pump(): void {
  while (running < CONCURRENCY && queue.length) {
    const job = queue.shift()!;
    running++;
    void job().finally(() => {
      running--;
      pump();
    });
  }
}

/** Object URL of the file's thumbnail, or null if it can't be made. */
export function thumbnail(file: FileEntry): Promise<string | null> {
  if (file.cloudOnly) return Promise.resolve(null);
  const key = keyOf(file);
  let url = urls.get(key);
  if (!url) {
    url = new Promise((resolve) => {
      queue.push(async () => {
        const hit = await cached(key);
        const blob = hit ?? (await render(file));
        if (blob && !hit) void store(key, blob);
        resolve(blob ? URL.createObjectURL(blob) : null);
      });
      pump();
    });
    urls.set(key, url);
  }
  return url;
}
