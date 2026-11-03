/**
 * Typed wrappers around the Rust commands. Components never call `invoke` directly,
 * so every command name and payload shape is defined in exactly one place.
 */
import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
  os: string;
  arch: string;
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}
