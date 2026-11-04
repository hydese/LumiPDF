/**
 * Open documents as tabs.
 *
 * Only the active tab and the one used just before it stay loaded. Other tabs sleep: their PDF
 * is closed and LumiPDF keeps where you were (page, zoom, position on the page), a picture of
 * the screen, and the password if the file needed one. Switching back shows that picture at
 * once, reopens the PDF (pdf.js reads only the parts it needs) and lands on the same spot.
 */
import { t } from "../i18n";
import { openPdfDialog, documentUrl, type DocumentRef } from "../ipc/documents";
import { libraryOpen, libraryUpdate } from "../ipc/library";
import { library, message } from "../library/library.svelte";
import { titleOf } from "../library/titles";
import { navigation } from "../app/navigation.svelte";
import { settings } from "../settings/store.svelte";
import { annotations } from "../annotations/store.svelte";
import { loadDocument, PasswordCancelledError, type LoadedPdf } from "../viewer/pdfjs";
import type { ReadingPlace, ViewerController, ViewerState } from "../viewer/ViewerController";

const SAVE_PAGE_DELAY_MS = 1500;
/** Tabs kept loaded: the active one plus this many recently used ones. */
const WARM_TABS = 1;
const MAX_TABS = 30;

export interface Tab {
  id: number;
  /** A PDF, or a formula sheet ("sheet:<id>" as its path). */
  kind: "pdf" | "sheet";
  path: string;
  name: string;
  title: string;
  /** Loaded PDF, or null while the tab sleeps. */
  pdf: LoadedPdf | null;
  place: ReadingPlace;
  /** Picture of the screen when the tab was left (object URL). */
  snapshot: string | null;
  /** The password that opened it, kept in memory only, so waking up doesn't ask again. */
  password: string | null;
  bookmarks: number[];
  lastUsed: number;
}

/** The active document, for code that only cares about "what's open". */
export interface OpenDocument {
  ref: DocumentRef;
  pdf: LoadedPdf;
  title: string;
}

export interface PasswordRequest {
  name: string;
  retry: boolean;
  resolve: (password: string | null) => void;
}

let nextId = 1;
const SHEET_PREFIX = "sheet:";

function sheetTab(id: string, title: string): Tab {
  return {
    id: nextId++,
    kind: "sheet",
    path: `${SHEET_PREFIX}${id}`,
    name: title,
    title,
    pdf: null,
    place: { page: 1, zoom: "page-width", offset: 0 },
    snapshot: null,
    password: null,
    bookmarks: [],
    lastUsed: Date.now(),
  };
}

class DocumentSession {
  /** Raw: tabs hold pdf.js objects, which must not be wrapped in reactive proxies. */
  tabs = $state.raw<Tab[]>([]);
  activeId = $state<number | null>(null);
  loadingName = $state<string | null>(null);
  error = $state<string | null>(null);
  password = $state<PasswordRequest | null>(null);
  view = $state<ViewerState | null>(null);
  controller = $state.raw<ViewerController | null>(null);
  /** Show the active tab's snapshot until its pages are drawn. */
  showSnapshot = $state(false);
  #pageTimer: ReturnType<typeof setTimeout> | null = null;
  #savedPage = 0;

  readonly active = $derived(this.tabs.find((t) => t.id === this.activeId) ?? null);
  readonly current = $derived.by((): OpenDocument | null => {
    const tab = this.active;
    return tab?.pdf ? { ref: { path: tab.path, name: tab.name, size: 0 }, pdf: tab.pdf, title: tab.title } : null;
  });
  readonly bookmarks = $derived(this.active?.bookmarks ?? []);
  readonly page = $derived(this.view?.page ?? 1);
  readonly isBookmarked = $derived(this.bookmarks.includes(this.page));

  // ---------------------------------------------------------------------------------------
  // Opening

  /** Opens a document in a new tab, or switches to it if it is already open. */
  async open(ref: DocumentRef): Promise<void> {
    const existing = this.tabs.find((t) => t.path === ref.path);
    if (existing) return this.activate(existing.id);
    this.error = null;
    this.loadingName = ref.name;
    try {
      const { pdf, password } = await this.#load(ref.path, ref.name, null);
      const known = library.doc(ref.path);
      const tab: Tab = {
        id: nextId++,
        kind: "pdf",
        path: ref.path,
        name: ref.name,
        title: titleOf(ref.name),
        pdf,
        place: { page: known?.page ?? 1, zoom: "page-width", offset: 0 },
        snapshot: null,
        password,
        bookmarks: known?.bookmarks ?? [],
        lastUsed: Date.now(),
      };
      await this.#leaveActive();
      const index = this.active ? this.tabs.indexOf(this.active) + 1 : this.tabs.length;
      this.tabs = [...this.tabs.slice(0, index), tab, ...this.tabs.slice(index)];
      this.#show(tab);
      if (this.tabs.length > MAX_TABS) await this.close(this.#leastRecent(tab.id)!.id);
      await libraryUpdate(ref.path, { opened: true, pages: pdf.doc.numPages }).catch(() => {});
      void library.refresh();
      this.#sleepExtras();
    } catch (err) {
      if (!(err instanceof PasswordCancelledError)) this.error = this.#openError(ref.name, err);
    } finally {
      this.loadingName = null;
    }
  }

  async openFromLibrary(path: string): Promise<void> {
    const existing = this.tabs.find((t) => t.path === path);
    if (existing) return this.activate(existing.id);
    this.error = null;
    try {
      await this.open(await libraryOpen(path));
    } catch (err) {
      this.error = message(err);
    }
  }

  async openWithDialog(): Promise<void> {
    for (const ref of await openPdfDialog()) await this.open(ref);
  }

  /** Opens a formula sheet in a tab (or switches to it). */
  async openSheet(id: string, title: string): Promise<void> {
    const path = `${SHEET_PREFIX}${id}`;
    const existing = this.tabs.find((t) => t.path === path);
    if (existing) return this.activate(existing.id);
    const tab = sheetTab(id, title);
    await this.#leaveActive();
    const index = this.active ? this.tabs.indexOf(this.active) + 1 : this.tabs.length;
    this.tabs = [...this.tabs.slice(0, index), tab, ...this.tabs.slice(index)];
    this.#show(tab);
    this.#sleepExtras();
  }

  /** Keeps a sheet tab's title in step with the sheet. */
  renameSheet(id: string, title: string): void {
    const tab = this.tabs.find((t) => t.path === `${SHEET_PREFIX}${id}`);
    if (tab && tab.title !== title) this.#patch(tab.id, { title, name: title });
  }

  /** The sheet shown in the active tab, if it is one. */
  get activeSheet(): string | null {
    const tab = this.active;
    return tab?.kind === "sheet" ? tab.path.slice(SHEET_PREFIX.length) : null;
  }

  /** Reopens the tabs from last time, asleep; only the active one loads. */
  async restore(paths: string[], activePath: string, sheetTitles: Record<string, string> = {}): Promise<void> {
    const tabs: Tab[] = [];
    for (const path of paths.slice(0, MAX_TABS)) {
      if (path.startsWith(SHEET_PREFIX)) {
        const id = path.slice(SHEET_PREFIX.length);
        if (id in sheetTitles) tabs.push(sheetTab(id, sheetTitles[id]!));
        continue;
      }
      const known = library.doc(path);
      if (!known?.file) continue;
      tabs.push({
        id: nextId++,
        kind: "pdf",
        path,
        name: known.name,
        title: titleOf(known.name),
        pdf: null,
        place: { page: known.page || 1, zoom: "page-width", offset: 0 },
        snapshot: null,
        password: null,
        bookmarks: known.bookmarks,
        lastUsed: 0,
      });
    }
    if (!tabs.length) return;
    this.tabs = tabs;
    const target = tabs.find((t) => t.path === activePath) ?? tabs[0]!;
    await this.activate(target.id);
  }

  // ---------------------------------------------------------------------------------------
  // Switching and closing

  async activate(id: number): Promise<void> {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    navigation.go("reader");
    if (tab.id === this.activeId && (tab.pdf || tab.kind === "sheet")) return;
    await this.#leaveActive();
    this.#show(tab);
    if (!tab.pdf && tab.kind === "pdf") await this.#wake(tab);
    this.#sleepExtras();
  }

  /** Ctrl+Tab / Ctrl+Shift+Tab. */
  cycle(direction: 1 | -1): void {
    if (this.tabs.length < 2 || !this.active) return;
    const i = this.tabs.indexOf(this.active);
    void this.activate(this.tabs[(i + direction + this.tabs.length) % this.tabs.length]!.id);
  }

  /** Ctrl+1..9 (9 is always the last tab, as in browsers). */
  activateIndex(n: number): void {
    const tab = n === 9 ? this.tabs.at(-1) : this.tabs[n - 1];
    if (tab) void this.activate(tab.id);
  }

  async close(id = this.activeId ?? -1): Promise<void> {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const index = this.tabs.indexOf(tab);
    if (tab.id === this.activeId) await this.#flushPage();
    this.tabs = this.tabs.filter((t) => t.id !== id);
    if (tab.snapshot) URL.revokeObjectURL(tab.snapshot);
    if (tab.pdf) await annotations.release(tab.pdf.doc);
    await tab.pdf?.close();
    if (tab.id === this.activeId) {
      this.activeId = null;
      this.view = null;
      const neighbour = this.tabs[Math.min(index, this.tabs.length - 1)];
      // Closing a tab from elsewhere (Library, Settings) switches tabs but keeps you there.
      const screen = navigation.screen;
      if (neighbour) {
        await this.activate(neighbour.id);
        if (screen !== "reader") navigation.screen = screen;
      } else {
        if (screen === "reader") navigation.go("library");
        void library.refresh();
      }
    }
    this.#persist();
  }

  move(id: number, toIndex: number): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const rest = this.tabs.filter((t) => t.id !== id);
    rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, tab);
    this.tabs = rest;
    this.#persist();
  }

  answerPassword(password: string | null): void {
    this.password?.resolve(password);
    this.password = null;
  }

  // ---------------------------------------------------------------------------------------
  // Reading state

  /** Called by the viewer whenever the page, zoom or find results change. */
  onViewerState(state: ViewerState): void {
    this.view = state;
    if (!this.active || this.active.kind === "sheet" || state.page === this.#savedPage) return;
    if (this.#pageTimer) clearTimeout(this.#pageTimer);
    this.#pageTimer = setTimeout(() => void this.#flushPage(), SAVE_PAGE_DELAY_MS);
  }

  onFirstRender(): void {
    this.showSnapshot = false;
  }

  toggleBookmark(page = this.page): void {
    const tab = this.active;
    if (!tab) return;
    const next = tab.bookmarks.includes(page) ? tab.bookmarks.filter((p) => p !== page) : [...tab.bookmarks, page].sort((a, b) => a - b);
    this.#patch(tab.id, { bookmarks: next });
    void libraryUpdate(tab.path, { bookmarks: next }).catch(() => {});
  }

  // ---------------------------------------------------------------------------------------
  // Internals

  #show(tab: Tab): void {
    navigation.go("reader");
    this.activeId = tab.id;
    this.showSnapshot = tab.snapshot !== null;
    this.#savedPage = tab.place.page;
    this.#patch(tab.id, { lastUsed: Date.now() });
    this.#persist();
  }

  /** Remembers where the active tab is and what it looks like, before showing another one. */
  async #leaveActive(): Promise<void> {
    const tab = this.active;
    const c = this.controller;
    if (!tab || !c || !tab.pdf) return;
    await this.#flushPage();
    const place = c.place();
    const snapshot = await c.snapshot();
    if (tab.snapshot) URL.revokeObjectURL(tab.snapshot);
    this.#patch(tab.id, { place, snapshot });
  }

  async #wake(tab: Tab): Promise<void> {
    this.loadingName = tab.name;
    try {
      await libraryOpen(tab.path); // grants read access again after a restart
      const { pdf, password } = await this.#load(tab.path, tab.name, tab.password);
      if (!this.tabs.some((t) => t.id === tab.id)) return void pdf.close(); // closed meanwhile
      this.#patch(tab.id, { pdf, password });
    } catch (err) {
      this.showSnapshot = false;
      if (err instanceof PasswordCancelledError) return void this.close(tab.id);
      this.error = this.#openError(tab.name, err);
    } finally {
      this.loadingName = null;
    }
  }

  /** Puts tabs to sleep, keeping the active one and the most recently used ones loaded. */
  #sleepExtras(): void {
    const awake = this.tabs.filter((t) => t.pdf && t.id !== this.activeId).sort((a, b) => b.lastUsed - a.lastUsed);
    for (const tab of awake.slice(WARM_TABS)) {
      void tab.pdf!.close();
      this.#patch(tab.id, { pdf: null });
    }
  }

  async #load(path: string, name: string, knownPassword: string | null): Promise<{ pdf: LoadedPdf; password: string | null }> {
    let password = knownPassword;
    let triedKnown = false;
    const pdf = await loadDocument(documentUrl({ path, name, size: 0 }), (retry) => {
      if (password && !triedKnown) {
        triedKnown = true;
        return Promise.resolve(password);
      }
      return new Promise((resolve) => {
        this.password = {
          name,
          retry: retry && !(knownPassword && triedKnown && password === knownPassword),
          resolve: (p) => {
            password = p;
            resolve(p);
          },
        };
      });
    });
    return { pdf, password };
  }

  async #flushPage(): Promise<void> {
    if (this.#pageTimer) clearTimeout(this.#pageTimer);
    this.#pageTimer = null;
    const tab = this.active;
    const page = this.view?.page;
    if (!tab || tab.kind === "sheet" || !page || page === this.#savedPage) return;
    this.#savedPage = page;
    this.#patch(tab.id, { place: { ...tab.place, page } });
    await libraryUpdate(tab.path, { page }).catch(() => {});
  }

  #leastRecent(exceptId: number): Tab | undefined {
    return [...this.tabs].filter((t) => t.id !== exceptId).sort((a, b) => a.lastUsed - b.lastUsed)[0];
  }

  #patch(id: number, patch: Partial<Tab>): void {
    this.tabs = this.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t));
  }

  /** Remembers open tabs so "On start: tabs from last time" can reopen them. */
  #persist(): void {
    const paths = this.tabs.map((t) => t.path);
    const active = this.active?.path ?? "";
    const r = settings.value.reader;
    if (r.activeTab === active && r.openTabs.length === paths.length && r.openTabs.every((p, i) => p === paths[i])) return;
    settings.update((s) => {
      s.reader.openTabs = paths;
      s.reader.activeTab = active;
    });
  }

  #openError(name: string, err: unknown): string {
    return t("open.error", { name, reason: err instanceof Error ? err.message : message(err) });
  }
}

export const session = new DocumentSession();
