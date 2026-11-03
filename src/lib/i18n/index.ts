/**
 * Translation layer. Every visible string lives in a locale file (locales/<code>.json), so a new
 * language is one new file plus one line in `catalogs`. English is the fallback for any key a
 * locale doesn't have yet.
 *
 * Plurals: keys ending in .one/.other (and .few/.many where a language needs them) are picked
 * with Intl.PluralRules through `tn`. Dates and numbers are formatted for the active locale.
 */
import en from "./locales/en.json";

export type MessageKey = keyof typeof en;
type PluralBase<K> = K extends `${infer B}.other` ? B : never;
export type PluralKey = PluralBase<MessageKey>;
type Params = Record<string, string | number>;

const catalogs: Record<string, Partial<Record<MessageKey, string>>> = { en };
let locale = "en";
let active: Partial<Record<MessageKey, string>> = en;
let plurals = new Intl.PluralRules("en");

export const AVAILABLE_LOCALES = Object.keys(catalogs);

export function setLocale(code: string): void {
  locale = code in catalogs ? code : "en";
  active = catalogs[locale] ?? en;
  plurals = new Intl.PluralRules(locale);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

export function currentLocale(): string {
  return locale;
}

function fill(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Returns the message for `key`, replacing `{name}` placeholders with `params`. */
export function t(key: MessageKey, params: Params = {}): string {
  return fill(active[key] ?? en[key], params);
}

/** Plural-aware message: `tn("library.summary.docs", 3)` → "3 documents". `{count}` is filled in. */
export function tn(base: PluralKey, count: number, params: Params = {}): string {
  const key = `${base}.${plurals.select(count)}` as MessageKey;
  const fallback = `${base}.other` as MessageKey;
  const template = active[key] ?? active[fallback] ?? en[key] ?? en[fallback];
  return fill(template, { count: count.toLocaleString(locale), ...params });
}

/** Study time: "45 m", "2 h 05 m". */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return t("time.lessThanMinute");
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? t("time.hoursMinutes", { h, m: String(m).padStart(2, "0") }) : t("time.minutes", { m });
}

export function formatDate(date: Date | number, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** "today at 21:40", "3 Nov at 09:12". */
export function formatWhen(date: Date): string {
  const sameDay = new Date().toDateString() === date.toDateString();
  const time = formatDate(date, { timeStyle: "short" });
  if (sameDay) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day") + ` · ${time}`;
  return `${formatDate(date, { day: "numeric", month: "short" })} · ${time}`;
}
