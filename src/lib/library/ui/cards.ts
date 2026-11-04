import type { CloudKind } from "../../ipc/library";

/** Badge colour per cloud drive (no brand logos, just a calm tint each). */
export const CLOUD_TONE: Record<CloudKind, "blue" | "sky" | "green" | "violet"> = {
  icloud: "sky",
  onedrive: "blue",
  gdrive: "green",
  dropbox: "violet",
};
