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
let failures = 0;

const seen = { lastSeenVersion: "2.0.0-alpha.0" };
const gn = { goodnotes: true };
const shotsAll = [
  { name: "library-light", settings: { app: { appearance: "light", ...seen } }, update: true },
  { name: "library-dark", settings: { app: { appearance: "dark", ...seen }, library: gn }, update: true },
  { name: "library-goodnotes-grid", settings: { app: { appearance: "light", ...seen }, library: { goodnotes: true, notebooks: { view: "grid" } } } },
  { name: "library-folder", settings: { app: { appearance: "light", ...seen } }, clickText: "Analisi 2", scrollTop: true },
  { name: "library-subfolder", settings: { app: { appearance: "dark", ...seen } }, clickText: ["Analisi 2", "Esercitazioni"], scrollTop: true },
  { name: "library-empty", settings: { app: { appearance: "light", ...seen } }, empty: true },
  { name: "library-search", settings: { app: { appearance: "light", ...seen } }, search: "analisi" },
  { name: "timer-timer", settings: { app: { appearance: "light", ...seen } }, click: '[aria-label="Study timer"]' },
  { name: "timer-pomodoro", settings: { app: { appearance: "dark", ...seen }, timer: { mode: "pomodoro" } }, click: '[aria-label="Study timer"]' },
  { name: "timer-alarm", settings: { app: { appearance: "light", ...seen }, timer: { mode: "alarm" } }, click: '[aria-label="Study timer"]' },
  { name: "timer-chrono", settings: { app: { appearance: "dark", ...seen }, timer: { mode: "chrono" } }, click: '[aria-label="Study timer"]', after: 'button.main' },
  { name: "reader-tabs-dark", settings: { app: { appearance: "light", ...seen } }, open: ["Analisi 2 — Trasformate", "Automatica — Lezione 12", "Controlli"], update: true },
  { name: "reader-light", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate", "Fisica 1"] },
  { name: "reader-moon-menu", settings: { app: { appearance: "light", ...seen } }, open: ["Analisi 2 — Trasformate"], rightClick: '[aria-label="Dark mode"]' },
  { name: "settings-light", settings: { app: { appearance: "light", ...seen } }, keys: "Control+Comma", update: true },
  { name: "settings-library", settings: { app: { appearance: "light", ...seen }, library: gn }, keys: "Control+Comma", section: "Library and cloud" },
  { name: "settings-timer-dark", settings: { app: { appearance: "dark", ...seen } }, keys: "Control+Comma", section: "Study timer" },
  { name: "welcome-1", settings: { app: { appearance: "light" } }, welcome: 0 },
  { name: "welcome-3-dark", settings: { app: { appearance: "dark" } }, welcome: 2 },
  { name: "welcome-4", settings: { app: { appearance: "light" } }, welcome: 3 },
  { name: "timer-alarm-12h", settings: { app: { appearance: "dark", ...seen }, timer: { mode: "alarm", clock24: false } }, click: '[aria-label="Study timer"]' },
  { name: "annotate-light", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], annotate: true },
  { name: "annotate-dark", settings: { app: { appearance: "light", ...seen } }, open: ["Analisi 2 — Trasformate"], annotate: true },
  { name: "annotate-menu", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], annotate: "menu" },
  { name: "whatsnew-light", settings: { app: { appearance: "light", lastSeenVersion: "1.0.5" } } },
];
const shots = shotsAll;

for (const shot of shots) {
  if (only && !only.includes(shot.name)) continue;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[${shot.name}]`, e.message));
  page.on("console", (m) => m.type() === "error" && console.error(`[${shot.name}] console:`, m.text()));
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
  try {
    if (shot.update) await page.waitForTimeout(3400);
    if (shot.welcome !== undefined) {
      await page.waitForSelector(".welcome .card");
      for (let i = 0; i < shot.welcome; i++) {
        await page.click('.welcome footer .btn.primary');
        await page.waitForTimeout(150);
      }
    }
    if (shot.search) await page.fill('input[type="search"]', shot.search);
    for (const text of [shot.clickText ?? []].flat()) {
      await page.click(`.folder:has-text("${text}")`);
      await page.waitForTimeout(300);
    }
    for (const title of [shot.open ?? []].flat()) {
      if (await page.locator(".screen .reading").count()) await page.click(".screen .reading");
      if (await page.locator('.layer:not([hidden]) .back').count()) await page.click('.layer:not([hidden]) .back');
      await page.click(`.layer:not([hidden]) button[title*="${title}"]`);
      await page.locator(".layer:not([hidden]) .pdfViewer .page canvas >> visible=true").first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(1000);
    }
    if (shot.annotate) {
    const text = page.locator(".layer:not([hidden]) .textLayer span").filter({ hasText: "Consider" }).first();
    const box = await text.boundingBox();
    const drag = async (x1, y1, x2, y2, steps = 12) => {
      await page.mouse.move(x1, y1);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps + Math.sin(i) * 0.6);
      await page.mouse.up();
      await page.waitForTimeout(120);
    };
    if (shot.annotate === "menu") {
      await drag(box.x + 2, box.y + box.height / 2, box.x + 330, box.y + box.height / 2 + 22);
      await page.waitForTimeout(300);
    } else {
      // Highlight a line of text with the highlight tool.
      await page.keyboard.press("h");
      await drag(box.x + 2, box.y + box.height / 2, box.x + 420, box.y + box.height / 2);
      // Underline the next line in blue.
      await page.click('.options button[aria-label="Underline"]');
      await drag(box.x + 2, box.y + box.height * 1.6, box.x + 300, box.y + box.height * 1.6);
      // Pen: circle an equation and an arrow.
      await page.keyboard.press("p");
      await page.mouse.move(box.x + 250, box.y + 80);
      await page.mouse.down();
      for (let a = 0; a <= 64; a++) await page.mouse.move(box.x + 330 + Math.cos(a / 10) * 95, box.y + 85 + Math.sin(a / 10) * 30);
      await page.mouse.up();
      await drag(box.x + 440, box.y + 140, box.x + 520, box.y + 110, 20);
      // Highlighter stroke on the "Small text" line.
      await page.keyboard.press("m");
      await drag(box.x, box.y + 300, box.x + 260, box.y + 302, 20);
      // A sticky note.
      await page.keyboard.press("n");
      await page.mouse.click(box.x + 700, box.y + 190);
      await page.keyboard.type("Exam: prove stability with Lyapunov");
      await page.click(".editor .btn.primary");
      await page.keyboard.press("p");
      await page.click('.doc-sidebar [role="tab"]:has-text("Notes")');
      await page.waitForTimeout(400);
    }
  }
  if (shot.keys) await page.keyboard.press(shot.keys);
    if (shot.section) await page.click(`nav button:has-text("${shot.section}")`);
    if (shot.click) await page.click(shot.click);
    if (shot.rightClick) await page.click(shot.rightClick, { button: "right" });
    if (shot.after) {
      await page.click(shot.after);
      await page.waitForTimeout(2300);
    }
    await page.waitForTimeout(900);
  } catch (err) {
    console.error(`[${shot.name}] failed:`, err.message.split("\n")[0]);
    failures++;
  }
  await page.screenshot({ path: path.join(out, `${shot.name}.png`) });
  console.log("shot", shot.name);
  await context.close();
}

await browser.close();
await server.close();
if (failures) process.exit(1);
