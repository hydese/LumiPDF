import { describe, expect, it } from "vitest";
import { detectPlatform, formatShortcut, isPrimaryModifier } from "../../src/lib/platform/shortcuts";

describe("shortcuts", () => {
  it("detects the platform from the user agent", () => {
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("macos");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });

  it("uses Cmd on macOS and Ctrl elsewhere", () => {
    expect(isPrimaryModifier({ ctrlKey: false, metaKey: true }, "macos")).toBe(true);
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: false }, "macos")).toBe(false);
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: false }, "windows")).toBe(true);
  });

  it("formats shortcuts per platform", () => {
    expect(formatShortcut("mod+shift+d", "windows")).toBe("Ctrl+Shift+D");
    expect(formatShortcut("mod+shift+d", "macos")).toBe("⌘⇧D");
  });
});
