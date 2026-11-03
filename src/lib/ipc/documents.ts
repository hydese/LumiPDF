/**
 * Opening documents. Rust decides which files the webview may read; these wrappers only
 * ask Rust to show the dialog or hand over files opened by drag-and-drop or "Open with".
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface DocumentRef {
  path: string;
  name: string;
  size: number;
}

export function openPdfDialog(): Promise<DocumentRef[]> {
  return invoke<DocumentRef[]>("open_pdf_dialog");
}

/** Documents passed on the command line before the window was ready. */
export function takePendingDocuments(): Promise<DocumentRef[]> {
  return invoke<DocumentRef[]>("take_pending_documents");
}

/** Documents dropped on the window or opened with "Open with" while the app runs. */
export function onDocumentsOpened(handler: (docs: DocumentRef[]) => void): Promise<UnlistenFn> {
  return listen<DocumentRef[]>("documents-opened", (event) => handler(event.payload));
}

/** URL through which pdf.js reads the file in chunks (asset protocol, range requests). */
export function documentUrl(doc: DocumentRef): string {
  return convertFileSrc(doc.path);
}
