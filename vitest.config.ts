import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [svelte()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
