// Development only. Collects image samples from PDFs for the photo model:
//   node tests/photo-model/collect.mjs <out-dir> <pdf>[:pages] ...
// pages: "1-20" or "1,5,9". Writes <out-dir>/<pdf-name>.json (samples + thumbnails). Keep the
// output out of the repository: thumbnails come from private PDFs.
import { createServer } from "vite";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const [out, ...docs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ root, configFile: root + "/vite.config.ts", logLevel: "error", server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();
const tab = await browser.newPage();
await tab.goto(`${base}/tests/photo-model/probe.html`);
await tab.waitForFunction(() => window.probe?.ready, null, { timeout: 60000 });
for (const arg of docs) {
  const [file, range] = arg.split(":");
  let pages = null;
  if (range) pages = range.split(",").flatMap((r) => { const [a, b] = r.split("-").map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; });
  const rel = "/" + resolve(file).slice(root.length + 1);
  const t = Date.now();
  const found = await tab.evaluate(([u, p]) => window.probe.collect(u, p), [rel, pages]);
  writeFileSync(`${out}/${basename(file, ".pdf")}.json`, JSON.stringify(found));
  console.log(`${basename(file)}: ${found.length} images in ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
await browser.close();
await server.close();
