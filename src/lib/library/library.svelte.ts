/**
 * The Library screen's data: folders, documents with reading progress, and title search.
 * Rust owns the data (see src-tauri/src/library.rs); this store mirrors it and refreshes it.
 */
import {
  libraryAddFolder,
  libraryForget,
  libraryLoad,
  libraryRemoveFolder,
  CLOUD_KINDS,
  type DocView,
  type FileEntry,
  type FolderKind,
  type FolderView,
  type LibraryView,
} from "../ipc/library";
import { matchesQuery, titleOf } from "./titles";
import { errorText } from "../i18n/errors";

const CONTINUE_READING = 8;
const SEARCH_RESULTS = 60;

export interface SearchHit {
  file: FileEntry;
  doc: DocView | undefined;
  where: string;
}

class LibraryStore {
  view = $state<LibraryView | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);
  query = $state("");

  readonly #byPath = $derived(new Map((this.view?.documents ?? []).map((d) => [d.path, d])));

  readonly continueReading = $derived(
    (this.view?.documents ?? []).filter((d) => d.file && d.lastOpened > 0).slice(0, CONTINUE_READING),
  );

  /** Plain folders (cloud drives and GoodNotes have their own cards). */
  readonly folders = $derived((this.view?.folders ?? []).filter((f) => f.kind === "folder"));
  readonly clouds = $derived((this.view?.folders ?? []).filter((f) => (CLOUD_KINDS as string[]).includes(f.kind)));
  readonly goodnotes = $derived((this.view?.folders ?? []).find((f) => f.kind === "goodnotes") ?? null);

  /** Where the folder browser is: a library folder and a subfolder inside it. */
  location = $state<{ root: string; dir: string } | null>(null);
  readonly locationFolder = $derived(this.view?.folders.find((f) => f.path === this.location?.root) ?? null);
  readonly level = $derived(this.locationFolder ? levelOf(this.locationFolder, this.location!.dir) : null);

  browse(root: string, dir = ""): void {
    this.query = "";
    this.location = { root, dir };
  }

  readonly documentCount = $derived(
    new Set([...(this.view?.folders ?? []).flatMap((f) => f.files.map((x) => x.path)), ...this.continueReading.map((d) => d.path)]).size,
  );

  readonly searchResults = $derived.by((): SearchHit[] => {
    const query = this.query.trim();
    if (!query || !this.view) return [];
    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    const add = (file: FileEntry, where: string) => {
      if (seen.has(file.path) || !matchesQuery(titleOf(file.name), query)) return;
      seen.add(file.path);
      hits.push({ file, doc: this.#byPath.get(file.path), where });
    };
    for (const d of this.view.documents) if (d.file) add(d.file, "");
    for (const f of this.view.folders) for (const file of f.files) add(file, f.name);
    return hits.slice(0, SEARCH_RESULTS);
  });

  doc(path: string): DocView | undefined {
    return this.#byPath.get(path);
  }

  async refresh(): Promise<void> {
    this.loading = true;
    try {
      this.view = await libraryLoad();
      this.error = null;
      if (this.location && !this.locationFolder) this.location = null;
    } catch (err) {
      this.error = message(err);
    } finally {
      this.loading = false;
    }
  }

  async addFolder(kind: FolderKind): Promise<void> {
    try {
      if (await libraryAddFolder(kind)) await this.refresh();
    } catch (err) {
      this.error = message(err);
    }
  }

  async removeFolder(folder: FolderView): Promise<void> {
    await libraryRemoveFolder(folder.path);
    await this.refresh();
  }

  async forget(path: string): Promise<void> {
    await libraryForget(path);
    await this.refresh();
  }
}

export interface Subfolder {
  name: string;
  dir: string;
  /** PDFs anywhere inside it. */
  count: number;
  /** Up to three of its newest PDFs, for the folder preview. */
  preview: FileEntry[];
}

/** One level of a library folder: its subfolders and the PDFs directly in it. */
export function levelOf(folder: FolderView, dir: string): { subfolders: Subfolder[]; files: FileEntry[] } {
  const prefix = dir ? `${dir}/` : "";
  const subs = new Map<string, Subfolder>();
  const files: FileEntry[] = [];
  for (const file of folder.files) {
    if (file.dir === dir) {
      files.push(file);
    } else if (!dir || file.dir.startsWith(prefix)) {
      const name = file.dir.slice(prefix.length).split("/")[0]!;
      let sub = subs.get(name);
      if (!sub) subs.set(name, (sub = { name, dir: prefix + name, count: 0, preview: [] }));
      sub.count++;
      if (sub.preview.length < 3) sub.preview.push(file);
    }
  }
  const subfolders = [...subs.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return { subfolders, files };
}

/** A readable message for an error, in the user's language. */
export const message = errorText;

export const library = new LibraryStore();
