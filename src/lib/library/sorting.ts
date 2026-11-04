/** Ordering for the folder browser: A–Z, Z–A, or most recently opened first. Tested. */
import type { FolderSort } from "../settings/schema";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function sortFolders<T>(items: readonly T[], sort: FolderSort, name: (t: T) => string, recency: (t: T) => number): T[] {
  const byName = (a: T, b: T) => collator.compare(name(a), name(b));
  const list = [...items];
  if (sort === "name-desc") return list.sort((a, b) => byName(b, a));
  if (sort === "recent") return list.sort((a, b) => recency(b) - recency(a) || byName(a, b));
  return list.sort(byName);
}

/** Files: names without ".pdf"; "Recently opened" puts never-opened files last, A–Z. */
export function sortFiles<T extends { name: string; path: string }>(files: readonly T[], sort: FolderSort, opened: (path: string) => number): T[] {
  return sortFolders(files, sort, (f) => f.name.replace(/\.pdf$/i, ""), (f) => opened(f.path));
}
