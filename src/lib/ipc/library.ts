/**
 * The library lives in Rust (library.json). These wrappers mirror its commands and types.
 */
import { invoke } from "@tauri-apps/api/core";
import type { DocumentRef } from "./documents";

export type FolderKind = "folder" | "icloud" | "goodnotes";

export interface FileEntry {
  path: string;
  name: string;
  size: number;
  /** Milliseconds since 1970. */
  modified: number;
  /** Stored only in the cloud; showing a thumbnail would download it. */
  cloudOnly: boolean;
}

export interface FolderView {
  path: string;
  name: string;
  kind: FolderKind;
  available: boolean;
  files: FileEntry[];
  truncated: boolean;
}

export interface DocState {
  path: string;
  name: string;
  lastOpened: number;
  page: number;
  pages: number;
  bookmarks: number[];
  studySeconds: number;
}

export interface DocView extends DocState {
  /** null when the file was moved or deleted. */
  file: FileEntry | null;
}

export interface LibraryView {
  folders: FolderView[];
  documents: DocView[];
  /** Study seconds per local day, "YYYY-MM-DD". */
  studyDays: Record<string, number>;
  icloudSuggestion: string | null;
}

export interface DocUpdate {
  opened?: boolean;
  page?: number;
  pages?: number;
  bookmarks?: number[];
  studySeconds?: number;
  day?: string;
}

export const libraryLoad = () => invoke<LibraryView>("library_load");
export const libraryAddFolder = (kind: FolderKind) => invoke<boolean>("library_add_folder", { kind });
export const libraryRemoveFolder = (path: string) => invoke<void>("library_remove_folder", { path });
export const libraryOpen = (path: string) => invoke<DocumentRef>("library_open", { path });
export const libraryUpdate = (path: string, update: DocUpdate) => invoke<void>("library_update", { path, update });
export const libraryAddStudyTime = (day: string, seconds: number) => invoke<void>("library_add_study_time", { day, seconds });
export const libraryForget = (path: string) => invoke<void>("library_forget", { path });
