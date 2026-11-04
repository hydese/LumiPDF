/**
 * Error messages in the user's language. The backend (Rust) and pdf.js report errors in English;
 * the ones a user can meet are matched here by their start and shown translated, with any detail
 * after the prefix kept as is. Anything unknown is shown unchanged.
 */
import { t, type MessageKey } from "./index";

/** Backend message (or its start, before a variable detail) → message key. */
const KNOWN: Array<[prefix: string, key: MessageKey]> = [
  ["File not found: ", "error.notFound"],
  ["Not a file: ", "error.notPdf"],
  ["Not a PDF file: ", "error.notPdf"],
  ["Choose a different name: LumiPDF never overwrites the original PDF", "error.overwrite"],
  ["The password for this PDF is not correct", "error.password"],
  ["This PDF needs its password to be exported", "error.needsPassword"],
  ["The owner password is not correct", "error.ownerPassword"],
  ["This PDF doesn't allow adding annotations", "error.noAnnotations"],
  ["This PDF can't be exported: ", "error.exportFailed"],
  ["Couldn't write the PDF: ", "error.writeFailed"],
  ["A picture can't be read: ", "error.pictureFailed"],
  ["Couldn't check for updates: ", "error.updateCheck"],
  ["The update couldn't be downloaded: ", "error.updateDownload"],
  ["The update couldn't be installed: ", "error.updateInstall"],
  ["No update to download", "error.updateGone"],
  ["The update isn't downloaded yet", "error.updateGone"],
  ["This document is not open", "error.notOpen"],
  ["This file is not in your library", "error.notInLibrary"],
];

/** pdf.js exception names → message key. */
const PDFJS: Record<string, MessageKey> = {
  InvalidPDFException: "error.invalidPdf",
  MissingPDFException: "error.notFound",
  ResponseException: "error.notFound",
  UnexpectedResponseException: "error.notFound",
};

function raw(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** A readable, translated message for an error from the backend, pdf.js or the browser. */
export function errorText(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (PDFJS[name]) return t(PDFJS[name]);
  const text = raw(err);
  for (const [prefix, key] of KNOWN) {
    if (text.startsWith(prefix)) return t(key, { detail: text.slice(prefix.length).trim() });
  }
  return text;
}
