import { invoke } from "@tauri-apps/api/core";

/** Asks where to save, then writes the PNG there. Resolves false if the user cancelled. */
export async function savePng(blob: Blob, suggestedName: string): Promise<boolean> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return invoke<boolean>("save_png", bytes, { headers: { "x-file-name": encodeURIComponent(suggestedName) } });
}

import type { DocumentRef } from "./documents";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

export type Compression = "none" | "light" | "recommended" | "strong";

export type ExportAnnotation =
  | { type: "mark"; page: number; kind: "highlight" | "underline" | "strike"; color: string; rects: number[][]; comment: string }
  | { type: "ink"; page: number; color: string; width: number; marker: boolean; line: number[]; outline: number[] }
  | { type: "note"; page: number; color: string; x: number; y: number; text: string };

export interface ExportDone {
  path: string;
  originalBytes: number;
  exportedBytes: number;
  imagesRecompressed: number;
  document: DocumentRef | null;
}

/** Asks where to save, then writes the copy. Resolves null if the user cancelled. */
export const exportPdf = (request: { source: string; title: string; annotations: ExportAnnotation[]; compression: Compression }) =>
  invoke<ExportDone | null>("export_pdf", { request });

export const revealInFolder = (path: string) => revealItemInDir(path);
