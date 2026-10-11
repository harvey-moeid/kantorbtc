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
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (
            /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(
              id,
            )
          )
            return "framework";
          if (
            /\/node_modules\/(zustand|zod|use-sync-external-store)\//.test(id)
          )
            return "state";
          if (
            /\/node_modules\/(three|@react-three\/fiber|@react-three\/drei|react-reconciler|three-stdlib|maath|suspend-react)\//.test(
              id,
            )
          )
            return "three";
          if (id.includes("/node_modules/lightweight-charts/")) return "chart";
        },
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
