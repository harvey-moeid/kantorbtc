import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:8787", ws: true } } },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      // Keep dependency initialization ordered by Rollup, including 3D decoders.
      // A circular chunk can build successfully but crash when a lazy route loads.
      onwarn(warning, warn) {
        if (warning.code === "CIRCULAR_CHUNK") throw new Error(warning.message);
        warn(warning);
      },
    },
  },
  test: {
    root: new URL(".", import.meta.url).pathname,
    include: [
      "packages/**/*.test.ts",
      "apps/api/**/*.test.ts",
      "apps/web/**/*.test.ts",
    ],
  },
} as Parameters<typeof defineConfig>[0]);
