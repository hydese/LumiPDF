import { describe, expect, it } from "vitest";
import { t } from "../../src/lib/i18n";

describe("i18n", () => {
  it("fills placeholders", () => {
    expect(t("app.devBuild", { version: "2.0.0" })).toBe("Version 2.0.0 — development build");
  });

  it("leaves unknown placeholders visible", () => {
    expect(t("app.devBuild")).toBe("Version {version} — development build");
  });
});

import { formatDuration, tn } from "../../src/lib/i18n";

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
