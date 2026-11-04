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

export interface ProtectionRequest {
  /** The password that opened the document, if it needed one. */
  openPassword: string | null;
  /** Remove the protection from the copy (needs the right password). */
  remove: boolean;
  ownerPassword: string | null;
}

export interface ProtectionInfo {
  protected: boolean;
  openPassword: boolean;
  /** true = blocked */
  restrictions: { print: boolean; copy: boolean; edit: boolean; annotate: boolean };
  /** The open password alone can unlock the copy (nothing else is blocked). */
  removableWithOpenPassword: boolean;
}

/** Asks where to save, then writes the copy. Resolves null if the user cancelled. */
export const exportPdf = (request: {
  source: string;
  title: string;
  annotations: ExportAnnotation[];
  compression: Compression;
  protection: ProtectionRequest;
}) => invoke<ExportDone | null>("export_pdf", { request });

/** What protects an open PDF (passwords and restrictions). */
export const pdfProtection = (source: string, openPassword: string | null) =>
  invoke<ProtectionInfo>("pdf_protection", { source, openPassword });

export const revealInFolder = (path: string) => revealItemInDir(path);
