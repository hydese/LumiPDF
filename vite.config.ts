import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import pkg from "./package.json" with { type: "json" };

// Tauri expects a fixed dev port and must not clear the terminal output of the Rust build.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: ["es2022", "chrome120", "safari16"],
    outDir: "dist",
    emptyOutDir: true,
    // pdf.js and its viewer are ~1 MB; the app loads from disk, so one chunk is fine.
    chunkSizeWarningLimit: 1500,
  },
});
