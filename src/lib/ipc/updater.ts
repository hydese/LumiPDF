import { Channel, invoke } from "@tauri-apps/api/core";

export interface UpdateMeta {
  version: string;
  notes: string | null;
}

export type DownloadEvent = { event: "progress"; downloaded: number; total: number | null } | { event: "done" };

/** This copy can install updates itself (installed, not the portable exe). */
export const updateInstallable = () => invoke<boolean>("update_installable");
/** `switching`: leaving the beta channel, so an older stable version is offered too. */
export const updateCheck = (beta: boolean, switching = false) => invoke<UpdateMeta | null>("update_check", { beta, switching });
export function updateDownload(onEvent: (e: DownloadEvent) => void): Promise<void> {
  const channel = new Channel<DownloadEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("update_download", { onEvent: channel });
}
/** Installs the downloaded update; LumiPDF closes (Windows) or restarts (macOS). */
export const updateInstall = () => invoke<void>("update_install");
