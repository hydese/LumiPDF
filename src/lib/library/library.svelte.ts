/**
 * The Library screen's data: folders, documents with reading progress, and title search.
 * Rust owns the data (see src-tauri/src/library.rs); this store mirrors it and refreshes it.
 */
import {
  libraryAddFolder,
  libraryForget,
  libraryLoad,
  libraryRemoveFolder,
  type DocView,
  type FileEntry,
  type FolderKind,
  type FolderView,
  type LibraryView,
} from "../ipc/library";
import { matchesQuery, titleOf } from "./titles";

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
  /** Path of the folder shown in "Folders", or "all". */
  folderFilter = $state("all");

  readonly #byPath = $derived(new Map((this.view?.documents ?? []).map((d) => [d.path, d])));

  readonly continueReading = $derived(
    (this.view?.documents ?? []).filter((d) => d.file && d.lastOpened > 0).slice(0, CONTINUE_READING),
  );

  /** Plain folders (iCloud and GoodNotes have their own cards). */
  readonly folders = $derived((this.view?.folders ?? []).filter((f) => f.kind === "folder"));
  readonly icloud = $derived((this.view?.folders ?? []).find((f) => f.kind === "icloud") ?? null);
  readonly goodnotes = $derived((this.view?.folders ?? []).find((f) => f.kind === "goodnotes") ?? null);

  readonly shelf = $derived.by((): FileEntry[] => {
    const folders = this.folderFilter === "all" ? this.folders : this.folders.filter((f) => f.path === this.folderFilter);
    return unique(folders.flatMap((f) => f.files));
  });

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
      if (this.folderFilter !== "all" && !this.folders.some((f) => f.path === this.folderFilter)) this.folderFilter = "all";
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

function unique(files: FileEntry[]): FileEntry[] {
  const seen = new Set<string>();
  return files.filter((f) => !seen.has(f.path) && seen.add(f.path));
}

export function message(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export const library = new LibraryStore();
