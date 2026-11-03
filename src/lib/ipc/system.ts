import { openUrl } from "@tauri-apps/plugin-opener";

/** Opens a web or mail link in the user's default app. Only http(s) and mailto are allowed. */
export function openExternal(url: string): Promise<void> {
  if (!/^(https?:|mailto:)/i.test(url)) return Promise.resolve();
  return openUrl(url);
}
