/**
 * Builds the files a GitHub release needs from the built installers:
 *  - latest.json: the updater manifest (version, notes, and per platform the download URL and
 *    the installer's signature), which the in-app updater reads;
 *  - release-notes.md: the release text, from src/lib/whatsnew/releases.json.
 *
 * Usage: node scripts/release-manifest.mjs <tag> <dir with the built files> <out dir>
 */
import fs from "node:fs";
import path from "node:path";

const [tag, dir, out] = process.argv.slice(2);
if (!tag || !dir || !out) {
  console.error("usage: release-manifest.mjs <tag> <artifacts dir> <out dir>");
  process.exit(2);
}
const root = path.resolve(import.meta.dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
if (tag !== `v${version}`) {
  console.error(`Tag ${tag} doesn't match package.json version ${version}`);
  process.exit(1);
}

const REPO = "hydese/LumiPDF";
const files = fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, String(f)));
const find = (test) => files.find((f) => test(path.basename(f)));
const url = (file) => `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(path.basename(file))}`;
const signature = (file) => fs.readFileSync(`${file}.sig`, "utf8").trim();

const platforms = {};
const setup = find((n) => n.endsWith("-setup.exe"));
if (!setup || !fs.existsSync(`${setup}.sig`)) {
  console.error("The Windows installer or its signature is missing");
  process.exit(1);
}
platforms["windows-x86_64"] = platforms["windows-x86_64-nsis"] = { signature: signature(setup), url: url(setup) };
const mac = find((n) => n.endsWith(".app.tar.gz"));
if (mac && fs.existsSync(`${mac}.sig`)) {
  platforms["darwin-aarch64"] = platforms["darwin-aarch64-app"] = { signature: signature(mac), url: url(mac) };
}

const releases = JSON.parse(fs.readFileSync(path.join(root, "src/lib/whatsnew/releases.json"), "utf8")).releases;
// Betas use the notes of the version they lead up to (2.1.0-beta.2 → 2.1.0) unless they have their own.
const entry = releases.find((r) => r.version === version) ?? releases.find((r) => r.version === version.split("-")[0]);
if (!entry) {
  console.error(`releases.json has no entry for ${version}`);
  process.exit(1);
}
const TAG = { new: "New", better: "Better", fixed: "Fixed" };
const notes = entry.items.map((i) => `- **${TAG[i.tag] ?? i.tag}: ${i.title}.** ${i.text}`).join("\n");

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "latest.json"),
  JSON.stringify({ version, notes: entry.items.map((i) => `${i.title}: ${i.text}`).join("\n"), pub_date: new Date().toISOString(), platforms }, null, 2),
);
fs.writeFileSync(
  path.join(out, "release-notes.md"),
  `${notes}\n\n**Download:** Windows installer (\`-setup.exe\`, updates itself) or portable (\`-portable.zip\`, no install).` +
    (mac ? " macOS: `.app.zip` (Apple Silicon)." : "") +
    "\n",
);
console.log(`latest.json for ${version}: ${Object.keys(platforms).join(", ")}`);
