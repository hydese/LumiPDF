/**
 * The annotations of open documents, the active tool, and undo/redo.
 *
 * Each document's annotations are loaded once (keyed by its fingerprint) and kept while it is
 * open in a tab; changes are saved shortly after they're made. Undo/redo is per document.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import { annotationsLoad, annotationsSave } from "../ipc/annotations";
import { parseAnnotations, type Annotation, type AnnotationFile } from "./model";

export type Tool = "select" | "highlight" | "pen" | "marker" | "eraser" | "note" | "snip";

const SAVE_DELAY_MS = 800;
const HISTORY = 200;

interface DocState {
  key: string;
  list: Annotation[];
  undo: Annotation[][];
  redo: Annotation[][];
  saveTimer: ReturnType<typeof setTimeout> | null;
}

/** pdf.js fingerprint: the PDF's own ID (or a hash of its start), stable across moves. */
export function documentKey(doc: PDFDocumentProxy): string | null {
  const id = doc.fingerprints?.[0];
  return id && /^[0-9a-f]{16,128}$/i.test(id) ? id.toLowerCase() : null;
}

class AnnotationStore {
  tool = $state<Tool>("select");
  /** Annotations of the active document. Raw: replaced as a whole on every change. */
  list = $state.raw<Annotation[]>([]);
  canUndo = $state(false);
  canRedo = $state(false);
  /** Increases on every change, so layers know to redraw. */
  revision = $state(0);
  #docs = new Map<string, DocState>();
  #active: DocState | null = null;

  /** Shows the annotations of `doc` (loading them the first time). */
  async activate(doc: PDFDocumentProxy | null): Promise<void> {
    const key = doc ? documentKey(doc) : null;
    if (!key) {
      this.#show(null);
      return;
    }
    let state = this.#docs.get(key);
    if (!state) {
      const raw = await annotationsLoad(key).catch(() => null);
      state = this.#docs.get(key) ?? { key, list: parseAnnotations(raw), undo: [], redo: [], saveTimer: null };
      this.#docs.set(key, state);
    }
    this.#show(state);
  }

  /** Forget a closed document (after saving it). */
  async release(doc: PDFDocumentProxy): Promise<void> {
    const key = documentKey(doc);
    const state = key ? this.#docs.get(key) : undefined;
    if (!state) return;
    await this.#save(state);
    this.#docs.delete(state.key);
    if (this.#active === state) this.#show(null);
  }

  get enabled(): boolean {
    return this.#active !== null;
  }

  add(a: Annotation): void {
    this.#change((list) => [...list, a]);
  }

  remove(ids: Set<string>): void {
    if (!ids.size) return;
    this.#change((list) => list.filter((a) => !ids.has(a.id)));
  }

  update(id: string, patch: Partial<Annotation>): void {
    this.#change((list) => list.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)));
  }

  get(id: string): Annotation | undefined {
    return this.list.find((a) => a.id === id);
  }

  onPage(page: number): Annotation[] {
    return this.list.filter((a) => a.page === page);
  }

  undo(): void {
    const s = this.#active;
    const previous = s?.undo.pop();
    if (!s || !previous) return;
    s.redo.push(s.list);
    this.#commit(s, previous);
  }

  redo(): void {
    const s = this.#active;
    const next = s?.redo.pop();
    if (!s || !next) return;
    s.undo.push(s.list);
    this.#commit(s, next);
  }

  /** Saves everything now (before the app closes). */
  async flush(): Promise<void> {
    await Promise.all([...this.#docs.values()].map((s) => this.#save(s)));
  }

  #change(fn: (list: Annotation[]) => Annotation[]): void {
    const s = this.#active;
    if (!s) return;
    s.undo.push(s.list);
    if (s.undo.length > HISTORY) s.undo.shift();
    s.redo = [];
    this.#commit(s, fn(s.list));
  }

  #commit(s: DocState, list: Annotation[]): void {
    s.list = list;
    this.#show(s);
    if (s.saveTimer) clearTimeout(s.saveTimer);
    s.saveTimer = setTimeout(() => void this.#save(s), SAVE_DELAY_MS);
  }

  async #save(s: DocState): Promise<void> {
    if (s.saveTimer) clearTimeout(s.saveTimer);
    else if (s.undo.length === 0 && s.redo.length === 0) return; // never changed
    s.saveTimer = null;
    const file: AnnotationFile = { version: 1, annotations: s.list };
    await annotationsSave(s.key, file).catch((err) => console.error("LumiPDF: could not save annotations", err));
  }

  #show(s: DocState | null): void {
    this.#active = s;
    this.list = s?.list ?? [];
    this.canUndo = (s?.undo.length ?? 0) > 0;
    this.canRedo = (s?.redo.length ?? 0) > 0;
    this.revision++;
  }
}

export const annotations = new AnnotationStore();
