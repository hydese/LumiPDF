#!/usr/bin/env node
/**
 * Screenshots of every screen in light and dark, using a fake backend (mock-tauri.js).
 * Usage: node tests/preview/shoot.mjs [--scale 1] → tests/preview/out/*.png
 */
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "tests/preview/out");
fs.mkdirSync(out, { recursive: true });
const scaleArg = process.argv.indexOf("--scale");
const deviceScaleFactor = scaleArg > 0 ? Number(process.argv[scaleArg + 1]) : 1;
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;

const server = await createServer({ root, configFile: path.join(root, "vite.config.ts"), logLevel: "error", server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const mock = fs.readFileSync(path.join(root, "tests/preview/mock-tauri.js"), "utf8");
const browser = await chromium.launch();

const seen = { lastSeenVersion: "2.0.0-alpha.0" };
const shots = [
  { name: "library-light", settings: { app: { appearance: "light", ...seen } }, update: true },
  { name: "library-dark", settings: { app: { appearance: "dark", ...seen } }, update: true },
  { name: "library-empty", settings: { app: { appearance: "light", ...seen } }, empty: true },
  { name: "library-search", settings: { app: { appearance: "light", ...seen } }, search: "analisi" },
  { name: "timer-light", settings: { app: { appearance: "light", ...seen } }, click: '[aria-label="Study timer"]' },
  { name: "timer-dark", settings: { app: { appearance: "dark", ...seen } }, click: '[aria-label="Study timer"]' },
  { name: "reader-dark", settings: { app: { appearance: "light", ...seen } }, open: "Controlli", update: true },
  { name: "reader-light", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: "Analisi 2 — Trasformate" },
  { name: "reader-settings", settings: { app: { appearance: "light", ...seen } }, open: "Analisi 2 — Trasformate", click: '[aria-label="Reading settings"]' },
  { name: "settings-light", settings: { app: { appearance: "light", ...seen } }, keys: "Control+Comma", update: true },
  { name: "settings-dark", settings: { app: { appearance: "dark", ...seen } }, keys: "Control+Comma", update: true },
  { name: "settings-timer", settings: { app: { appearance: "light", ...seen } }, keys: "Control+Comma", section: "Study timer" },
  { name: "settings-about-dark", settings: { app: { appearance: "dark", ...seen } }, keys: "Control+Comma", section: "About" },
  { name: "whatsnew-light", settings: { app: { appearance: "light", lastSeenVersion: "1.0.5" } } },
  { name: "whatsnew-dark", settings: { app: { appearance: "dark", lastSeenVersion: "1.0.5" } } },
];

for (const shot of shots) {
  if (only && !only.includes(shot.name)) continue;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[${shot.name}]`, e.message));
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({
      json: shot.update
        ? [{ tag_name: "v2.0.1", body: "- Sharper text at 150% zoom\n- Faster library loading\n- Fixed: bookmarks on page 1", html_url: "https://github.com/hydese/LumiPDF/releases/tag/v2.0.1", draft: false, prerelease: false, published_at: new Date().toISOString() }]
        : [],
    }),
  );
  await page.addInitScript(`window.__PREVIEW__ = ${JSON.stringify({ settings: shot.settings, empty: shot.empty })};\n${mock}`);
  await page.goto(`${base}/index.html`);
  await page.waitForSelector(".screen", { timeout: 15000 });
  if (shot.update) await page.waitForTimeout(3400);
  if (shot.search) await page.fill('input[type="search"]', shot.search);
  if (shot.open) {
    await page.click(`button[title*="${shot.open}"]`);
    await page.waitForSelector(".pdfViewer .page canvas", { timeout: 15000 });
    await page.waitForTimeout(1200);
  }
  if (shot.keys) await page.keyboard.press(shot.keys);
  if (shot.section) await page.click(`nav button:has-text("${shot.section}")`);
  if (shot.click) await page.click(shot.click);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, `${shot.name}.png`) });
  console.log("shot", shot.name);
  await context.close();
}

await browser.close();
await server.close();
