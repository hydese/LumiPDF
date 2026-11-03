/**
 * The open document: loading it (with the password prompt), where the reader is, bookmarks,
 * and reporting progress to the library so "Continue reading" knows where to resume.
 */
import { t } from "../i18n";
import { documentUrl, openPdfDialog, type DocumentRef } from "../ipc/documents";
import { libraryOpen, libraryUpdate } from "../ipc/library";
import { library, message } from "../library/library.svelte";
import { titleOf } from "../library/titles";
import { navigation } from "../app/navigation.svelte";
import { loadDocument, PasswordCancelledError, type LoadedPdf } from "../viewer/pdfjs";
import type { ViewerController, ViewerState } from "../viewer/ViewerController";

const SAVE_PAGE_DELAY_MS = 1500;

export interface OpenDocument {
  ref: DocumentRef;
  pdf: LoadedPdf;
  title: string;
  startPage: number;
}

export interface PasswordRequest {
  name: string;
  retry: boolean;
  resolve: (password: string | null) => void;
}

class DocumentSession {
  current = $state<OpenDocument | null>(null);
  loadingName = $state<string | null>(null);
  error = $state<string | null>(null);
  password = $state<PasswordRequest | null>(null);
  view = $state<ViewerState | null>(null);
  controller = $state<ViewerController | null>(null);
  bookmarks = $state<number[]>([]);
  #pageTimer: ReturnType<typeof setTimeout> | null = null;
  #savedPage = 0;

  readonly page = $derived(this.view?.page ?? 1);
  readonly isBookmarked = $derived(this.bookmarks.includes(this.page));

  async open(ref: DocumentRef): Promise<void> {
    this.loadingName = ref.name;
    this.error = null;
    try {
      const pdf = await loadDocument(documentUrl(ref), (retry) =>
        new Promise((resolve) => (this.password = { name: ref.name, retry, resolve })),
      );
      await this.#closeCurrent();
      const known = library.doc(ref.path);
      this.bookmarks = known?.bookmarks ?? [];
      this.#savedPage = known?.page ?? 1;
      this.current = { ref, pdf, title: titleOf(ref.name), startPage: known?.page ?? 1 };
      navigation.go("reader");
      await libraryUpdate(ref.path, { opened: true, pages: pdf.doc.numPages }).catch(() => {});
      void library.refresh();
    } catch (err) {
      if (!(err instanceof PasswordCancelledError)) {
        this.error = t("open.error", { name: ref.name, reason: err instanceof Error ? err.message : message(err) });
      }
    } finally {
      this.loadingName = null;
    }
  }

  async openFromLibrary(path: string): Promise<void> {
    this.error = null;
    try {
      await this.open(await libraryOpen(path));
    } catch (err) {
      this.error = message(err);
    }
  }

  async openWithDialog(): Promise<void> {
    const [first] = await openPdfDialog();
    if (first) await this.open(first);
  }

  answerPassword(password: string | null): void {
    this.password?.resolve(password);
    this.password = null;
  }

  /** Called by the viewer whenever the page, zoom or find results change. */
  onViewerState(state: ViewerState): void {
    this.view = state;
    if (!this.current || state.page === this.#savedPage) return;
    if (this.#pageTimer) clearTimeout(this.#pageTimer);
    this.#pageTimer = setTimeout(() => void this.#savePage(), SAVE_PAGE_DELAY_MS);
  }

  toggleBookmark(page = this.page): void {
    if (!this.current) return;
    const next = this.bookmarks.includes(page) ? this.bookmarks.filter((p) => p !== page) : [...this.bookmarks, page].sort((a, b) => a - b);
    this.bookmarks = next;
    void libraryUpdate(this.current.ref.path, { bookmarks: next }).catch(() => {});
  }

  /** Closes the document and returns to the Library. */
  async close(): Promise<void> {
    await this.#closeCurrent();
    navigation.go("library");
    void library.refresh();
  }

  async #savePage(): Promise<void> {
    this.#pageTimer = null;
    const page = this.view?.page;
    if (!this.current || !page) return;
    this.#savedPage = page;
    await libraryUpdate(this.current.ref.path, { page }).catch(() => {});
  }

  async #closeCurrent(): Promise<void> {
    if (this.#pageTimer) {
      clearTimeout(this.#pageTimer);
      await this.#savePage();
    }
    const previous = this.current;
    this.current = null;
    this.view = null;
    this.bookmarks = [];
    await previous?.pdf.close();
  }
}

export const session = new DocumentSession();
