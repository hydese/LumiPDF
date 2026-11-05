import { invoke } from "@tauri-apps/api/core";

/**
 * Remembered passwords of locked PDFs, kept in Windows Credential Manager or the macOS
 * Keychain (never in LumiPDF's own files). All calls fail quietly: a missing keychain only
 * means LumiPDF asks again.
 */
export const passwordRecall = (path: string) => invoke<string | null>("pdf_password_get", { path }).catch(() => null);
export const passwordRemember = (path: string, password: string) => invoke<void>("pdf_password_set", { path, password }).catch(() => {});
export const passwordForget = (path: string) => invoke<void>("pdf_password_forget", { path }).catch(() => {});
