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
