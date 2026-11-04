/**
 * Formula sheets in the app: the list for the Library, the open sheets, undo/redo, and saving
 * (shortly after each change, like annotations).
 */
import { t } from "../i18n";
import { sheetAddImage, sheetDelete, sheetLoad, sheetSave, sheetsList, type SheetSummary } from "../ipc/sheets";
import { message } from "../library/library.svelte";
import { settings } from "../settings/store.svelte";
import { newId, newSheet, parseSheet, type Sheet, type SnipItem } from "./model";

const SAVE_DELAY_MS = 600;
const HISTORY = 100;

interface Open {
  sheet: Sheet;
  undo: Sheet[];
  redo: Sheet[];
  timer: ReturnType<typeof setTimeout> | null;
}

class Sheets {
  list = $state<SheetSummary[]>([]);
  /** Open sheets by id. Raw: replaced as a whole on every change. */
  open = $state.raw<Record<string, Sheet>>({});
  error = $state<string | null>(null);
  #state = new Map<string, Open>();

  async refresh(): Promise<void> {
    try {
      this.list = await sheetsList();
    } catch (err) {
      this.error = message(err);
    }
  }

  async create(title = t("sheets.untitled")): Promise<Sheet> {
    const sheet = newSheet(title, settings.value.sheets.paper);
    this.#remember(sheet);
    await this.#save(this.#state.get(sheet.id)!, true);
    settings.update((s) => (s.sheets.last = sheet.id));
    return sheet;
  }

  async load(id: string): Promise<Sheet | null> {
    const known = this.#state.get(id);
    if (known) return known.sheet;
    const sheet = parseSheet(await sheetLoad(id).catch(() => null), id);
    if (sheet) this.#remember(sheet);
    return sheet;
  }

  get(id: string): Sheet | null {
    return this.open[id] ?? null;
  }

  canUndo(id: string): boolean {
    void this.open;
    return (this.#state.get(id)?.undo.length ?? 0) > 0;
  }
  canRedo(id: string): boolean {
    void this.open;
    return (this.#state.get(id)?.redo.length ?? 0) > 0;
  }

  /** Changes a sheet. `history: false` for steps of a drag (the drag's start is recorded once). */
  update(id: string, fn: (sheet: Sheet) => Sheet, history = true): void {
    const s = this.#state.get(id);
    if (!s) return;
    if (history) {
      s.undo.push(s.sheet);
      if (s.undo.length > HISTORY) s.undo.shift();
      s.redo = [];
    }
    this.#commit(s, { ...fn(s.sheet), modified: Date.now() });
  }

  /** Records the current state for undo (before a drag that then uses history: false). */
  checkpoint(id: string): void {
    const s = this.#state.get(id);
    if (!s) return;
    s.undo.push(s.sheet);
    s.redo = [];
  }

  undo(id: string): void {
    const s = this.#state.get(id);
    const prev = s?.undo.pop();
    if (!s || !prev) return;
    s.redo.push(s.sheet);
    this.#commit(s, prev);
  }

  redo(id: string): void {
    const s = this.#state.get(id);
    const next = s?.redo.pop();
    if (!s || !next) return;
    s.undo.push(s.sheet);
    this.#commit(s, next);
  }

  async remove(id: string): Promise<void> {
    const s = this.#state.get(id);
    if (s?.timer) clearTimeout(s.timer);
    this.#state.delete(id);
    const { [id]: _, ...rest } = this.open;
    this.open = rest;
    await sheetDelete(id).catch((err) => (this.error = message(err)));
    if (settings.value.sheets.last === id) settings.update((x) => (x.sheets.last = ""));
    await this.refresh();
  }

  /**
   * Adds a snip (a PNG on white paper) to a sheet: `target` or the last used one, or a new sheet
   * when there is none yet. Returns the sheet.
   */
  async addSnip(png: Blob, info: Omit<SnipItem, "id" | "type" | "image" | "scale">, target?: string): Promise<Sheet> {
    const id = target ?? settings.value.sheets.last;
    const sheet = (id && (await this.load(id))) || (await this.create());
    const image = await sheetAddImage(png);
    const item: SnipItem = { id: newId(), type: "snip", image, scale: 1, ...info };
    if (sheet.layout === "free") {
      // Below everything on the last page.
      const last = Math.max(0, sheet.pages - 1);
      item.free = { page: last, x: 32, y: 32, w: info.natural[0] };
    }
    this.update(sheet.id, (s) => ({ ...s, items: [...s.items, item] }));
    settings.update((x) => (x.sheets.last = sheet.id));
    await this.flush(sheet.id);
    return this.get(sheet.id)!;
  }

  /** Saves pending changes now. */
  async flush(id?: string): Promise<void> {
    const all = id ? [this.#state.get(id)].filter((s): s is Open => !!s) : [...this.#state.values()];
    await Promise.all(all.filter((s) => s.timer).map((s) => this.#save(s)));
  }

  #remember(sheet: Sheet): void {
    this.#state.set(sheet.id, { sheet, undo: [], redo: [], timer: null });
    this.open = { ...this.open, [sheet.id]: sheet };
  }

  #commit(s: Open, sheet: Sheet): void {
    s.sheet = sheet;
    this.open = { ...this.open, [sheet.id]: sheet };
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => void this.#save(s), SAVE_DELAY_MS);
  }

  async #save(s: Open, refresh = false): Promise<void> {
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    try {
      await sheetSave(s.sheet.id, s.sheet);
      this.error = null;
    } catch (err) {
      this.error = message(err);
    }
    const summary = { id: s.sheet.id, title: s.sheet.title, modified: s.sheet.modified, items: s.sheet.items.length };
    if (refresh || !this.list.some((x) => x.id === s.sheet.id)) await this.refresh();
    else this.list = [summary, ...this.list.filter((x) => x.id !== summary.id)].sort((a, b) => b.modified - a.modified);
  }
}

export const sheets = new Sheets();
