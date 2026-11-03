/**
 * Minimal translation layer. Every visible string lives in a locale file so new languages
 * can be added later without touching components. English is the only locale for now.
 */
import en from "./locales/en.json";

export type MessageKey = keyof typeof en;
type Params = Record<string, string | number>;

const catalogs: Record<string, Record<MessageKey, string>> = { en };
let active: Record<MessageKey, string> = en;

export function setLocale(locale: string): void {
  active = catalogs[locale] ?? en;
}

/** Returns the message for `key`, replacing `{name}` placeholders with `params`. */
export function t(key: MessageKey, params: Params = {}): string {
  const template = active[key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
