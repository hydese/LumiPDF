import { invoke } from "@tauri-apps/api/core";

/** Raw annotation file for a document fingerprint (null when there is none). */
export const annotationsLoad = (key: string) => invoke<unknown>("annotations_load", { key });
export const annotationsSave = (key: string, data: unknown) => invoke<void>("annotations_save", { key, data });
