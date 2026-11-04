import { afterEach, describe, expect, it } from "vitest";
import { AVAILABLE_LOCALES, detectLocale, formatDuration, languageName, setLocale, t, tn } from "../../src/lib/i18n";
import { errorText } from "../../src/lib/i18n/errors";
import en from "../../src/lib/i18n/locales/en.json";
import { RELEASES } from "../../src/lib/whatsnew/whatsnew";

const catalogs = import.meta.glob<Record<string, string>>("../../src/lib/i18n/locales/*.json", { eager: true, import: "default" });
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLocale("en"));

describe("i18n", () => {
  it("fills placeholders", () => {
    expect(t("open.loading", { name: "a.pdf" })).toBe("Opening a.pdf…");
  });

  it("leaves unknown placeholders visible", () => {
    expect(t("open.loading")).toBe("Opening {name}…");
  });
});

describe("plurals and durations", () => {
  it("picks the plural form", () => {
    expect(tn("library.summary.docs", 1)).toBe("1 document");
    expect(tn("library.summary.docs", 24)).toBe("24 documents");
    expect(tn("library.summary.docs", 1200)).toBe("1,200 documents");
  });

  it("formats study time", () => {
    expect(formatDuration(30)).toBe("< 1 m");
    expect(formatDuration(45 * 60)).toBe("45 m");
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe("2 h 05 m");
  });
});

describe("languages", () => {
  it("has the six languages", () => {
    expect(AVAILABLE_LOCALES).toEqual(["en", "it", "pt-BR", "fr", "de", "es"]);
    expect(AVAILABLE_LOCALES.map(languageName)).toEqual(["English", "Italiano", "Português (Brasil)", "Français", "Deutsch", "Español"]);
  });

  for (const [file, catalog] of Object.entries(catalogs)) {
    const code = file.split("/").pop()!.replace(".json", "");
    if (code === "en") continue;
    it(`${code}: every text, with the same placeholders, and nothing extra`, () => {
      const missing = Object.keys(en).filter((k) => typeof catalog[k] !== "string" || !catalog[k]!.trim());
      const extra = Object.keys(catalog).filter((k) => !(k in en));
      const wrong = Object.keys(en).filter((k) => k in catalog && placeholders(catalog[k]!).join() !== placeholders((en as Record<string, string>)[k]!).join());
      expect({ missing, extra, wrong }).toEqual({ missing: [], extra: [], wrong: [] });
    });
  }

  it("translates every 2.0.0 note", () => {
    const notes = RELEASES.find((r) => r.version === "2.0.0")!;
    for (const item of notes.items) {
      for (const code of AVAILABLE_LOCALES.filter((c) => c !== "en")) {
        expect(item.tr?.[code]?.title, `${code}: ${item.title}`).toBeTruthy();
        expect(item.tr?.[code]?.text, `${code}: ${item.title}`).toBeTruthy();
      }
    }
  });

  it("follows the system language", () => {
    expect(detectLocale(["it-IT", "en-US"])).toBe("it");
    expect(detectLocale(["pt-PT"])).toBe("pt-BR");
    expect(detectLocale(["pt-BR"])).toBe("pt-BR");
    expect(detectLocale(["es-MX"])).toBe("es");
    expect(detectLocale(["de-AT"])).toBe("de");
    expect(detectLocale(["ja-JP", "fr-CA"])).toBe("fr");
    expect(detectLocale(["ja-JP"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });

  it("switches language", () => {
    setLocale("it");
    expect(t("nav.library")).toBe("Libreria");
    expect(tn("library.summary.docs", 3)).toBe("3 documenti");
    setLocale("xx");
    expect(t("nav.library")).toBe("Library");
  });
});

describe("error messages", () => {
  it("translates the backend's messages and keeps details", () => {
    setLocale("it");
    expect(errorText({ kind: "invalid_input", message: "The password for this PDF is not correct" })).toBe(t("error.password"));
    expect(errorText({ message: "Couldn't write the PDF: disk full" })).toContain("disk full");
    expect(errorText({ name: "InvalidPDFException", message: "Invalid PDF structure." })).toBe(t("error.invalidPdf"));
    expect(errorText(new Error("something else"))).toBe("something else");
  });
});
