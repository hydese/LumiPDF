/** Display title of a PDF: its file name without the extension. */
export function titleOf(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

/** Lowercase, without accents, for search: "Anàlisi" matches "analisi". */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** True if every word of `query` appears in `title`, in any order. */
export function matchesQuery(title: string, query: string): boolean {
  const haystack = normalizeForSearch(title.replace(/[_\-.]+/g, " "));
  return normalizeForSearch(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
