/**
 * Copies the pdf.js data files the app needs at runtime (character maps, standard fonts,
 * image decoders, colour profiles, annotation icons) into public/pdfjs, so they ship with
 * the app and match the installed pdfjs-dist version exactly. Runs before dev and build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules/pdfjs-dist");
const dest = path.join(root, "public/pdfjs");

const folders = { cmaps: "cmaps", standard_fonts: "standard_fonts", wasm: "wasm", iccs: "iccs", images: "web/images" };

fs.rmSync(dest, { recursive: true, force: true });
for (const [name, from] of Object.entries(folders)) {
  fs.cpSync(path.join(src, from), path.join(dest, name), { recursive: true });
}
console.log(`pdf.js assets copied to ${path.relative(root, dest)}`);
