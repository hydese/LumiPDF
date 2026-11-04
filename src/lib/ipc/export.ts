import { invoke } from "@tauri-apps/api/core";

/** Asks where to save, then writes the PNG there. Resolves false if the user cancelled. */
export async function savePng(blob: Blob, suggestedName: string): Promise<boolean> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return invoke<boolean>("save_png", bytes, { headers: { "x-file-name": encodeURIComponent(suggestedName) } });
}
