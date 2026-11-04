/**
 * Where an internal PDF link points: pdf.js writes the destination into the link's href
 * ("#" + escaped JSON for explicit destinations, "#" + escaped name for named ones).
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

export interface LinkTarget {
  /** 1-based page number. */
  page: number;
  /** Target point in PDF user space; null when the destination doesn't say. */
  x: number | null;
  y: number | null;
}

type ExplicitDest = [unknown, { name?: string } | null, ...unknown[]];

/** Decodes the href pdf.js gives an internal link. Returns the destination, or null. */
export function parseLinkHash(href: string): { explicit: ExplicitDest } | { named: string } | { page: number } | null {
  const hash = href.slice(href.indexOf("#") + 1);
  if (!hash) return null;
  // The inverse of escape(): %uXXXX and %XX are character codes (not UTF-8 bytes).
  const text = hash.replace(/%u([0-9a-f]{4})|%([0-9a-f]{2})/gi, (_, u: string | undefined, b: string | undefined) => String.fromCharCode(parseInt(u ?? b ?? "0", 16)));
  if (text.startsWith("[")) {
    try {
      const dest = JSON.parse(text) as unknown;
      return Array.isArray(dest) && dest.length >= 2 ? { explicit: dest as ExplicitDest } : null;
    } catch {
      return null;
    }
  }
  const page = /^page=(\d+)/.exec(text);
  if (page) return { page: Number(page[1]) };
  return { named: text };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The point an explicit destination shows (XYZ, FitH, FitBH, FitR; others: top of the page). */
export function destinationPoint(dest: ExplicitDest): { x: number | null; y: number | null } {
  const kind = dest[1]?.name;
  switch (kind) {
    case "XYZ":
      return { x: num(dest[2]), y: num(dest[3]) };
    case "FitH":
    case "FitBH":
      return { x: null, y: num(dest[2]) };
    case "FitR":
      return { x: num(dest[2]), y: num(dest[5]) };
    default:
      return { x: null, y: null };
  }
}

export async function resolveLink(doc: PDFDocumentProxy, href: string): Promise<LinkTarget | null> {
  const parsed = parseLinkHash(href);
  if (!parsed) return null;
  if ("page" in parsed) return parsed.page >= 1 && parsed.page <= doc.numPages ? { page: parsed.page, x: null, y: null } : null;
  let dest: ExplicitDest | null;
  if ("named" in parsed) dest = ((await doc.getDestination(parsed.named).catch(() => null)) as ExplicitDest | null) ?? null;
  else dest = parsed.explicit;
  if (!dest) return null;
  const ref = dest[0];
  let index: number;
  if (typeof ref === "number") index = ref;
  else if (ref && typeof ref === "object" && "num" in ref) {
    const found = await doc.getPageIndex(ref as { num: number; gen: number }).catch(() => -1);
    if (found < 0) return null;
    index = found;
  } else return null;
  if (index < 0 || index >= doc.numPages) return null;
  return { page: index + 1, ...destinationPoint(dest) };
}
