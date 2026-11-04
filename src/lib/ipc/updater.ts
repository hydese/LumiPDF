import { Channel, invoke } from "@tauri-apps/api/core";

export interface UpdateMeta {
  version: string;
  notes: string | null;
}

export type DownloadEvent = { event: "progress"; downloaded: number; total: number | null } | { event: "done" };

/** This copy can install updates itself (installed, not the portable exe). */
export const updateInstallable = () => invoke<boolean>("update_installable");
export const updateCheck = (beta: boolean) => invoke<UpdateMeta | null>("update_check", { beta });
export function updateDownload(onEvent: (e: DownloadEvent) => void): Promise<void> {
  const channel = new Channel<DownloadEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("update_download", { onEvent: channel });
}
/** Installs the downloaded update; LumiPDF closes (Windows) or restarts (macOS). */
export const updateInstall = () => invoke<void>("update_install");
