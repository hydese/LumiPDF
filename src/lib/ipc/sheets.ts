import { invoke } from "@tauri-apps/api/core";
import type { DocumentRef } from "./documents";

export interface SheetSummary {
  id: string;
  title: string;
  modified: number;
  items: number;
}

export type ExportPlaced =
  | { kind: "image"; page: number; x: number; y: number; w: number; h: number; image: string }
  | { kind: "text"; page: number; x: number; y: number; size: number; text: string };

export const sheetsList = () => invoke<SheetSummary[]>("sheets_list");
export const sheetLoad = (id: string) => invoke<unknown>("sheet_load", { id });
export const sheetSave = (id: string, sheet: unknown) => invoke<void>("sheet_save", { id, sheet });
export const sheetDelete = (id: string) => invoke<void>("sheet_delete", { id });

/** Stores a snip picture; resolves to its name. */
export async function sheetAddImage(blob: Blob): Promise<string> {
  return invoke<string>("sheet_add_image", new Uint8Array(await blob.arrayBuffer()));
}

const urls = new Map<string, Promise<string>>();
/** An object URL for a stored picture (cached for the session). */
export function sheetImageUrl(name: string): Promise<string> {
  let url = urls.get(name);
  if (!url) {
    url = invoke<ArrayBuffer>("sheet_image", { name }).then((bytes) => URL.createObjectURL(new Blob([bytes], { type: "image/png" })));
    url.catch(() => urls.delete(name));
    urls.set(name, url);
  }
  return url;
}

/** Asks where to save, then writes the PDF. Null if cancelled. */
export const sheetExportPdf = (request: { title: string; width: number; height: number; pages: number; items: ExportPlaced[] }) =>
  invoke<DocumentRef | null>("sheet_export_pdf", { request });
