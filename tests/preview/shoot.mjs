#!/usr/bin/env node
/**
 * Screenshots of every screen in light and dark, using a fake backend (mock-tauri.js).
 * Usage: node tests/preview/shoot.mjs [--scale 1] [--only a,b] [--version 2.0.0] [--out dir]
 *   → tests/preview/out/*.png
 * --version renders the app as that version (e.g. without the BETA badge, for the README pictures:
 * scripts/readme-images.mjs).
 */
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const out = path.resolve(arg("--out") ?? path.join(root, "tests/preview/out"));
const version = arg("--version") ?? JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
fs.mkdirSync(out, { recursive: true });
const scaleArg = process.argv.indexOf("--scale");
const deviceScaleFactor = scaleArg > 0 ? Number(process.argv[scaleArg + 1]) : 1;
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;

const server = await createServer({ root, configFile: path.join(root, "vite.config.ts"), define: { __APP_VERSION__: JSON.stringify(version) }, logLevel: "error", server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const mock = fs.readFileSync(path.join(root, "tests/preview/mock-tauri.js"), "utf8");
const browser = await chromium.launch();
let failures = 0;

const seen = { lastSeenVersion: version };
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
  { name: "settings-reading-dark", settings: { app: { appearance: "dark", ...seen } }, keys: "Control+Comma", section: "Reading" },
  { name: "welcome-1", settings: { app: { appearance: "light" } }, welcome: 0 },
  { name: "welcome-3-dark", settings: { app: { appearance: "dark" } }, welcome: 2 },
  { name: "welcome-4", settings: { app: { appearance: "light" } }, welcome: 3 },
  { name: "timer-alarm-12h", settings: { app: { appearance: "dark", ...seen }, timer: { mode: "alarm", clock24: false } }, click: '[aria-label="Study timer"]' },
  { name: "annotate-light", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], annotate: true },
  { name: "annotate-dark", settings: { app: { appearance: "light", ...seen } }, open: ["Analisi 2 — Trasformate"], annotate: true },
  { name: "annotate-menu", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], annotate: "menu" },
  { name: "annotate-zoom", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], annotate: "zoom" },
  { name: "snip-menu", settings: { app: { appearance: "light", ...seen } }, open: ["Analisi 2 — Trasformate"], annotate: "snip" },
  { name: "export", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], annotate: true, exportFlow: true },
  { name: "export-compress", settings: { app: { appearance: "dark", ...seen } }, open: ["Analisi 2 — Trasformate"], annotate: true, exportFlow: "compress" },
  { name: "export-protected", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], annotate: true, exportFlow: "unlock", protection: { protected: true, openPassword: false, restrictions: { print: true, copy: true, edit: true, annotate: false }, removableWithOpenPassword: false } },
  { name: "annotate-steps", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], annotate: true, steps: ["v", "e", "Control+Equal", "Control+Equal", "Control+Minus"] },
  { name: "annotate-tabs", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Automatica — Lezione 12", "Analisi 2 — Trasformate"], annotate: true, steps: ["Control+1", "Control+2", "e", "Control+Equal", "draw"] },
  { name: "stats-light", settings: { app: { appearance: "light", ...seen } }, click: '.sources .btn:has-text("Stats")' },
  { name: "stats-dark", settings: { app: { appearance: "dark", ...seen } }, click: '.sources .btn:has-text("Stats")', hover: ".bars .hit >> nth=-2" },
  { name: "library-today", settings: { app: { appearance: "light", ...seen } } },
  { name: "link-preview", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Controlli — Appunti"], linkHover: 0 },
  { name: "link-preview-dark", settings: { app: { appearance: "light", ...seen } }, open: ["Controlli — Appunti"], linkHover: 3 },
  { name: "link-preview-toc", settings: { app: { appearance: "light", ...seen } }, open: ["Controlli — Appunti"], linkHover: "toc" },
  { name: "sheet", settings: { app: { appearance: "light", ...seen } }, open: ["Analisi 2 — Trasformate"], sheetFlow: true },
  { name: "sheet-light", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], sheetFlow: true },
  { name: "sheet-zoom", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], sheetFlow: true, sheetZoom: true },
  { name: "library-sheets", settings: { app: { appearance: "light", ...seen }, sheets: { last: "" } }, seedSheets: true },
  { name: "study-off", settings: { app: { appearance: "dark", ...seen } }, offFlow: true },
  { name: "erase-notes", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], annotate: true, eraseFlow: true },
  { name: "hand-tool", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], handFlow: true },
  { name: "hex-picker", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false }, annotate: { recentColors: ["#ffd400", "#5a4b00", "#5d4e02", "#584900", "#ff0000", "#5b4c01", "#2a9d8f"] } }, open: ["Analisi 2 — Trasformate"], hexFlow: true },
  { name: "welcome-usage", settings: { app: { appearance: "light" } }, welcome: 1 },
  { name: "welcome-usage-dark", settings: { app: { appearance: "dark" }, study: { tools: false } }, welcome: 1 },
  { name: "settings-study-tools", settings: { app: { appearance: "light", ...seen } }, keys: "Control+Comma" },
  { name: "library-reading-only", settings: { app: { appearance: "light", ...seen }, study: { tools: false } } },
  { name: "reader-reading-only", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false }, study: { tools: false } }, open: ["Analisi 2 — Trasformate"], annotate: "snip" },
  { name: "welcome-updates", settings: { app: { appearance: "light" } }, welcome: 5 },
  { name: "settings-updates-auto", settings: { app: { appearance: "light", ...seen, updateMode: "auto" } }, keys: "Control+Comma", update: true },
  { name: "clarity-off", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"] },
  { name: "clarity-on", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false, textClarity: true } }, open: ["Analisi 2 — Trasformate"] },
  { name: "beta-badge", settings: { app: { appearance: "light", ...seen } }, clickText: "Analisi 2" },
  { name: "beta-unlock", settings: { app: { appearance: "dark", ...seen } }, keys: "Control+Comma", section: "About", tapVersion: 4 },
  { name: "fullscreen", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"], keys: "F11" },
  // For the README (scripts/readme-images.mjs): no update banner, the same page in light and dark.
  { name: "readme-library-light", settings: { app: { appearance: "light", ...seen } }, settle: true },
  { name: "readme-library-dark", settings: { app: { appearance: "dark", ...seen } }, settle: true },
  { name: "readme-page-light", settings: { app: { appearance: "light", ...seen }, reading: { darkEnabled: false } }, open: ["Analisi 2 — Trasformate"] },
  { name: "readme-page-dark", settings: { app: { appearance: "dark", ...seen } }, open: ["Analisi 2 — Trasformate"] },
  { name: "whatsnew-light", settings: { app: { appearance: "light", lastSeenVersion: "1.0.5" } } },
];
const shots = only ? shotsAll.filter((s) => only.includes(s.name)) : shotsAll;

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
  await page.addInitScript(`window.__PREVIEW__ = ${JSON.stringify({ settings: shot.settings, empty: shot.empty, protection: shot.protection, seedSheets: shot.seedSheets, update: shot.update })};\n${mock}`);
  await page.goto(`${base}/index.html`);
  await page.waitForSelector(".screen", { timeout: 15000 });
  try {
    if (shot.update || shot.settle) await page.waitForTimeout(3400);
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
    if (shot.annotate === "zoom") {
      await page.keyboard.press("p");
      await drag(box.x + 20, box.y + 40, box.x + 300, box.y + 60, 20);
      await page.keyboard.press("n");
      await page.mouse.click(box.x + 360, box.y + 40);
      await page.keyboard.type("moved note");
      await page.click(".editor .btn.primary");
      // Drag the note somewhere else.
      const pin = page.locator(".lumi-note").first();
      const pb = await pin.boundingBox();
      await page.mouse.move(pb.x + 10, pb.y + 10);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(pb.x + 10 + i * 12, pb.y + 10 + i * 4);
      await page.mouse.up();
      await page.keyboard.press("p");
      await page.fill(".options .px input", "6");
      await page.keyboard.press("Enter");
      await page.locator(".options .px input").blur();
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press("Control+Equal");
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(1500);
      const t2 = await page.locator(".layer:not([hidden]) .textLayer span").filter({ hasText: "Consider" }).first().boundingBox();
      if (t2) await drag(t2.x + 20, t2.y + 80, t2.x + 500, t2.y + 120, 25);
      console.log("zoom:", await page.locator(".zoom").first().innerText(), "notes:", await page.locator(".lumi-note").count());
    } else if (shot.annotate === "snip") {
      await page.keyboard.press("s");
      await page.keyboard.press("Control+Equal");
      await page.keyboard.press("Control+Equal");
      await page.waitForTimeout(800);
      const b2 = await page.locator(".layer:not([hidden]) .textLayer span").filter({ hasText: "Consider" }).first().boundingBox();
      await drag(b2.x - 6, b2.y - 40, b2.x + 420, b2.y + 120, 10);
      await page.mouse.wheel(0, 60);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(out, "snip-select.png") });
      await page.click('.menu button.primary');
      await page.waitForTimeout(500);
      console.log("saved png bytes:", await page.evaluate(() => window.__SAVED_PNG__));
      const data = await page.evaluate(() => window.__SAVED_PNG_DATA__ ?? []);
      if (data.length) fs.writeFileSync(path.join(out, "snip-result.png"), Buffer.from(data));
    } else if (shot.annotate === "menu") {
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
  if (shot.offFlow) {
    // From the Stats screen and from a sheet tab: Settings → Study tools off → Back.
    await page.click('.sources .btn:has-text("Stats")');
    await page.waitForTimeout(400);
    await page.keyboard.press("Control+Comma");
    await page.click(".study-tools .main .switch");
    await page.click('button:has-text("Back")');
    await page.waitForTimeout(500);
    console.log("after stats:", await page.locator(".layer:not([hidden]) h1").first().innerText().catch(() => "BLANK"));
    await page.keyboard.press("Control+Comma");
    await page.click(".study-tools .main .switch");
    await page.click('button:has-text("Back")');
    await page.click('.sources .btn:has-text("New sheet")');
    await page.waitForTimeout(500);
    await page.keyboard.press("Control+Comma");
    await page.click(".study-tools .main .switch");
    console.log("still in settings:", await page.locator('h2:has-text("General"), h1:has-text("General")').count() > 0 || (await page.locator(".study-tools").count()) > 0);
    await page.click('button:has-text("Back")');
    await page.waitForTimeout(500);
    console.log("after sheet tab:", await page.locator(".layer:not([hidden]) h1").first().innerText().catch(() => "BLANK"));
  }
  if (shot.eraseFlow) {
    const count = () => page.locator('.doc-sidebar li').count();
    console.log("notes before:", await count());
    await page.keyboard.press("Escape");
    await page.keyboard.press("e");
    const b = await page.locator(".layer:not([hidden]) .pdfViewer .page").first().boundingBox();
    for (let y = b.y + 40; y < Math.min(b.y + b.height, 780); y += 10) {
      await page.mouse.move(b.x + 20, y);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, y, { steps: 6 });
      await page.mouse.move(b.x + b.width - 20, y, { steps: 6 });
      await page.mouse.up();
    }
    await page.waitForTimeout(400);
    console.log("notes after:", await count(), "pins:", await page.locator(".lumi-note").count());
    // Draw a stroke, then rub it out and let go over the sidebar.
    await page.keyboard.press("p");
    await page.mouse.move(b.x + 150, b.y + 300);
    await page.mouse.down();
    await page.mouse.move(b.x + 400, b.y + 320, { steps: 12 });
    await page.mouse.up();
    console.log("with stroke:", await count());
    await page.keyboard.press("e");
    await page.mouse.move(b.x + 140, b.y + 305);
    await page.mouse.down();
    await page.mouse.move(b.x + 420, b.y + 312, { steps: 14 });
    await page.mouse.move(100, 400, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    console.log("released outside:", await count());
  }
  if (shot.handFlow) {
    await page.keyboard.press("Escape");
    for (let i = 0; i < 3; i++) await page.keyboard.press("Control+Equal");
    await page.waitForTimeout(800);
    await page.keyboard.press("g");
    const c = page.locator(".layer:not([hidden]) .pdfViewer").locator("xpath=..");
    const before = await c.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    await page.mouse.move(700, 500);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(700 - i * 10, 500 - i * 20);
    await page.mouse.up();
    const after = await c.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    const sel = await page.evaluate(() => String(window.getSelection()));
    console.log("hand scroll:", before, "->", after, "selection:", JSON.stringify(sel));
  }
  if (shot.hexFlow) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("p");
    await page.click(".options .any");
    await page.fill(".options .hex input", "8e44ad");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const b = await page.locator(".layer:not([hidden]) .pdfViewer .page").first().boundingBox();
    await page.mouse.move(b.x + 160, b.y + 560);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(b.x + 160 + i * 14, b.y + 560 + Math.sin(i / 2) * 16);
    await page.mouse.up();
    await page.click(".options .any");
    await page.waitForTimeout(300);
    console.log("custom selected:", await page.locator(".options .any").getAttribute("aria-pressed"), "panel open:", await page.locator(".options .panel").count());
  }
  if (shot.sheetFlow) {
    await page.keyboard.press("Escape");
    const text = page.locator(".layer:not([hidden]) .textLayer span").filter({ hasText: "Consider" }).first();
    const b = await text.boundingBox();
    const dragBox = async (x1, y1, x2, y2) => {
      await page.keyboard.press("s");
      await page.mouse.move(x1, y1);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8);
      await page.mouse.up();
      await page.waitForTimeout(300);
    };
    const regions = [
      [b.x + 190, b.y + 40, b.x + 560, b.y + 92],
      [b.x + 250, b.y + 180, b.x + 490, b.y + 236],
      [b.x - 4, b.y + 292, b.x + 600, b.y + 316],
    ];
    for (const [i, r] of regions.entries()) {
      await dragBox(...r);
      await page.screenshot({ path: path.join(out, `${shot.name}-menu${i}.png`) });
      await page.locator(".menu .split .primary").first().click();
      await page.locator(".menu .status").waitFor({ timeout: 8000 }).catch(() => {});
      console.log("status:", await page.locator(".menu .status").innerText().catch(() => "-"));
      if (i < regions.length - 1) await page.keyboard.press("Escape");
    }
    await page.click('.menu button:has-text("Open sheet")');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `${shot.name}-1.png`) });
    // A title before the second snip.
    await page.locator(".sheet-page .item.snip").first().click();
    await page.click('.bar .btn:has-text("Title")');
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Laplace transform");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    // Drag the last snip to the top.
    const items = page.locator(".sheet-page .item.snip");
    const last = await items.last().boundingBox();
    const first = await page.locator(".sheet-page .item").first().boundingBox();
    await page.mouse.move(last.x + 30, last.y + 10);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(last.x + 30, last.y + 10 + ((first.y - 4 - last.y - 10) * i) / 12);
    await page.screenshot({ path: path.join(out, `${shot.name}-drag.png`) });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${shot.name}-2.png`) });
    console.log("order:", await page.locator(".sheet-page .item").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")?.slice(0, 30))));
    // Free placement: drag the title to the right.
    await page.click('.seg button:has-text("Free")');
    await page.waitForTimeout(300);
    const t = await page.locator(".sheet-page .item.title").first().boundingBox();
    await page.mouse.move(t.x + 20, t.y + 8);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(t.x + 20 + i * 18, t.y + 8 + i * 30);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `${shot.name}-3.png`) });
    if (shot.sheetZoom) {
      await page.click('.zoom button[aria-label="Zoom out"]');
      await page.click('.zoom button[aria-label="Zoom out"]');
      await page.waitForTimeout(300);
      const item = page.locator(".sheet-page .item.snip").first();
      const before = await item.boundingBox();
      await page.mouse.move(before.x + 20, before.y + 8);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(before.x + 20 + i * 15, before.y + 8 + i * 12);
      await page.mouse.up();
      await page.waitForTimeout(300);
      const after = await item.boundingBox();
      console.log("zoomed drag:", Math.round(before.x), Math.round(before.y), "->", Math.round(after.x), Math.round(after.y));
      // Make it smaller with the handle, then move it again.
      await item.click();
      const h = await page.locator(".sheet-page .item.selected .handle").boundingBox();
      await page.mouse.move(h.x + 6, h.y + 6);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(h.x + 6 - i * 12, h.y + 6 - i * 3);
      await page.mouse.up();
      await page.waitForTimeout(200);
      const small = await item.boundingBox();
      await page.mouse.move(small.x + small.width / 2, small.y + small.height / 2);
      await page.mouse.down();
      // Towards the page centre, to see a guide.
      const pageBox = await page.locator(".sheet-page").first().boundingBox();
      const tx = pageBox.x + pageBox.width / 2 + 2;
      for (let i = 1; i <= 10; i++) await page.mouse.move(small.x + small.width / 2 + ((tx - small.x - small.width / 2) * i) / 10, small.y + small.height / 2 + i * 20);
      await page.screenshot({ path: path.join(out, `${shot.name}-guides.png`) });
      console.log("guides:", await page.locator(".guide").count());
      await page.mouse.up();
      await page.waitForTimeout(200);
      const moved = await item.boundingBox();
      console.log("resized:", Math.round(small.width), "moved:", Math.round(small.x), Math.round(small.y), "->", Math.round(moved.x), Math.round(moved.y));
      await page.screenshot({ path: path.join(out, `${shot.name}-zoom.png`) });
    }
    await page.click('.export .btn');
    await page.click('.menu button:has-text("PDF")');
    await page.waitForTimeout(600);
    const req = await page.evaluate(() => window.__SHEET_EXPORT__);
    fs.writeFileSync(path.join(out, `${shot.name}-export.json`), JSON.stringify(req, null, 1));
    console.log("export items:", req?.items?.length, "pages:", req?.pages);
  }
  if (shot.exportFlow) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+e");
    await page.waitForTimeout(400);
    if (shot.exportFlow === "compress") {
      await page.click('.compress .switch');
      await page.selectOption('.compress select', "strong");
      await page.waitForTimeout(200);
    }
    if (shot.exportFlow === "unlock") {
      await page.click('.protection .switch');
      await page.fill('.protection .field', "admin");
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: path.join(out, `${shot.name}-dialog.png`) });
    await page.click('.dialog .btn.primary');
    await page.waitForTimeout(500);
    const req = await page.evaluate(() => window.__EXPORT_REQUEST__);
    fs.writeFileSync(path.join(out, `${shot.name}-request.json`), JSON.stringify(req, null, 1));
  }
  if (shot.keys) await page.keyboard.press(shot.keys);
    // Key presses (or "draw": a pen stroke mid-page) with a screenshot after each.
    for (const [i, key] of (shot.steps ?? []).entries()) {
      if (key === "draw") {
        const b = await page.locator(".layer:not([hidden]) .pdfViewer .page").first().boundingBox();
        await page.keyboard.press("p");
        await page.mouse.move(b.x + 150, b.y + 330);
        await page.mouse.down();
        for (let j = 1; j <= 20; j++) await page.mouse.move(b.x + 150 + j * 15, b.y + 330 + Math.sin(j / 2) * 20);
        await page.mouse.up();
      } else await page.keyboard.press(key);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(out, `${shot.name}-${i + 1}.png`) });
    }
    if (shot.section) await page.click(`nav button:has-text("${shot.section}")`);
    if (shot.click) await page.click(shot.click);
    if (shot.hover) await page.hover(shot.hover);
    if (shot.tapVersion) {
      for (let i = 0; i < shot.tapVersion; i++) await page.click(".about .version");
      await page.waitForTimeout(100);
      console.log("notice:", await page.locator(".beta-notice").innerText().catch(() => "-"));
    }
    if (shot.linkHover !== undefined) {
      // Hover an internal link on page 2 (page 1 is the contents page: no previews there).
      const page2 = page.locator('.layer:not([hidden]) .page[data-page-number="2"]');
      await page2.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1200);
      const toc = page.locator('.layer:not([hidden]) .page[data-page-number="1"] [data-internal-link] a').first();
      const links = page2.locator("[data-internal-link] a");
      console.log("links on page 2:", await links.count(), "on page 1:", await page.locator('.layer:not([hidden]) .page[data-page-number="1"] [data-internal-link] a').count());
      if (shot.linkHover === "toc") {
        await page.evaluate(() => document.querySelector(".pdfViewer").parentElement.scrollTo(0, 0));
        await page.waitForTimeout(600);
        await toc.hover();
      } else await links.nth(shot.linkHover).hover();
      await page.waitForTimeout(1200);
      console.log("preview shown:", await page.locator(".lumi-link-preview.ready").count());
    }
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
