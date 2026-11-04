#!/usr/bin/env node
/**
 * LumiPDF rendering bench.
 *
 * Opens every PDF in tests/fixtures (and tests/private, which git ignores) in a real browser
 * engine, renders the chosen pages and writes PNGs plus an HTML report to tests/bench/out.
 * Exits with code 1 if any PDF fails to open, so CI catches loader regressions.
 *
 * Usage: npm run bench -- [--browser chromium|webkit|all] [--pages 1,2] [--scale 1.5] [--dpr 1]
 *                         [--themes all|none|id,id] [--theme-pages 1,5]
 */
import { createServer } from "vite";
import { chromium, webkit } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "tests/bench/out");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const browsers = arg("browser", "chromium") === "all" ? ["chromium", "webkit"] : [arg("browser", "chromium")];
const pages = arg("pages", "1").split(",").map(Number);
const scale = Number(arg("scale", "1.5"));
const dpr = Number(arg("dpr", "1"));
const allThemes = ["original", "lumina-black", "oled-black", "night-paper", "deep-slate", "soft-contrast"];
const themes = arg("themes", "all") === "none" ? [] : arg("themes", "all") === "all" ? allThemes : arg("themes", "").split(",");
const themePages = arg("theme-pages", "1").split(",").map(Number);

function listPdfs(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((f) => f.toLowerCase().endsWith(".pdf")).sort().map((f) => `${dir}/${f}`);
}
// Files that ask for a password to open are covered by the export tests (Rust); rendering them
// is the same as the owner-password fixtures once unlocked.
const pdfs = [...listPdfs("tests/fixtures"), ...listPdfs("tests/private")].filter((f) => !f.includes("user-password"));

// Use the app's own Vite config (Svelte plugin) so the bench can mount real app components.
const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "error",
  server: { port: 0, strictPort: false },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");

const engines = { chromium, webkit };
const report = [];
let failures = 0;

for (const name of browsers) {
  const browser = await engines[name].launch();
  const tab = await browser.newPage();
  tab.on("pageerror", (e) => console.error(`[${name}] page error:`, e.message));
  await tab.goto(`${base}/tests/bench/page/index.html`);
  await tab.waitForFunction(() => window.bench?.ready === true, null, { timeout: 30000 });
  fs.mkdirSync(path.join(outDir, name), { recursive: true });

  for (const pdf of pdfs) {
    const res = await tab.evaluate(([u, p, s, d]) => window.bench.render(u, p, s, d), [`/${pdf}`, pages, scale, dpr]);
    const label = path.basename(pdf, ".pdf");
    if (!res.ok) {
      failures++;
      console.log(`FAIL  ${name.padEnd(8)} ${label}: ${res.error}`);
      report.push({ browser: name, label, error: res.error, images: [] });
      continue;
    }
    const images = res.pages.map((pg) => {
      const file = `${name}/${label}-p${pg.page}.png`;
      fs.writeFileSync(path.join(outDir, file), Buffer.from(pg.png.split(",")[1], "base64"));
      return { file, ...pg, png: undefined };
    });
    console.log(`OK    ${name.padEnd(8)} ${label} (${res.numPages} pages)`);
    report.push({ browser: name, label, numPages: res.numPages, images });
  }

  // Viewer check: the real viewer component must draw exactly what pdf.js draws.
  await tab.goto(`${base}/tests/bench/page/viewer.html`);
  await tab.setViewportSize({ width: 1280, height: 800 });
  await tab.waitForFunction(() => window.viewerCheck?.ready === true, null, { timeout: 30000 });
  for (const pdf of pdfs) {
    const label = path.basename(pdf, ".pdf");
    try {
      const v = await tab.evaluate((u) => window.viewerCheck.check(u), `/${pdf}`);
      const same = v.differing === 0;
      if (!same) failures++;
      console.log(`${same ? "OK  " : "DIFF"}  ${name.padEnd(8)} viewer ${label}: ${v.width}x${v.height}, ${v.textSpans} text spans, ${v.differing} differing px (max delta ${v.maxDelta})`);
      const entry = report.find((r) => r.browser === name && r.label === label);
      if (entry) entry.viewer = v;
    } catch (err) {
      failures++;
      console.log(`FAIL  ${name.padEnd(8)} viewer ${label}: ${err.message}`);
    }
  }

  // Reading themes: selected pages of every PDF through the real viewer and the dark engine.
  if (themes.length > 0) {
    fs.mkdirSync(path.join(outDir, name, "themes"), { recursive: true });
    for (const pdf of pdfs) {
      const label = path.basename(pdf, ".pdf");
      for (const pageNumber of themePages) {
        for (const theme of themes) {
          try {
            const png = await tab.evaluate(([u, t, p]) => window.viewerCheck.renderTheme(u, t, p), [`/${pdf}`, theme, pageNumber]);
            const file = `${name}/themes/${label}-p${pageNumber}-${theme}.png`;
            fs.writeFileSync(path.join(outDir, file), Buffer.from(png.split(",")[1], "base64"));
            const entry = report.find((r) => r.browser === name && r.label === label);
            entry?.themes?.push(file) ?? (entry && (entry.themes = [file]));
          } catch (err) {
            if (!String(err.message).includes("did not render")) {
              failures++;
              console.log(`FAIL  ${name.padEnd(8)} theme ${theme} ${label} p${pageNumber}: ${err.message}`);
            }
          }
        }
      }
      console.log(`OK    ${name.padEnd(8)} themes ${label}`);
    }
  }
  await browser.close();
}
await server.close();

const rows = report
  .map((r) => `<tr><td>${r.browser}</td><td>${r.label}</td><td>${r.error ? `<b style="color:#c33">${r.error}</b>` : `${r.numPages} pages`}${r.viewer ? `<br>viewer: ${r.viewer.differing} px differ, ${r.viewer.textSpans} text spans` : ""}</td>
  <td>${r.images.map((i) => `<a href="${i.file}"><img src="${i.file}" height="160"></a>`).join(" ")}
  ${(r.themes ?? []).map((f) => `<a href="${f}"><img src="${f}" height="160"></a>`).join(" ")}</td></tr>`)
  .join("\n");
fs.writeFileSync(
  path.join(outDir, "report.html"),
  `<!doctype html><meta charset="utf-8"><title>LumiPDF bench</title><style>body{font:13px system-ui;margin:24px}td{padding:6px 10px;border-bottom:1px solid #ddd;vertical-align:top}img{border:1px solid #ccc}</style>
<h1>LumiPDF bench</h1><p>${new Date().toISOString()} · scale ${scale} · dpr ${dpr}</p><table>${rows}</table>`,
);
console.log(`\n${pdfs.length} PDFs × ${browsers.length} browser(s), ${failures} failure(s). Report: tests/bench/out/report.html`);
process.exit(failures > 0 ? 1 : 0);
