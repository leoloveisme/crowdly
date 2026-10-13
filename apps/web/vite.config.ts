import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// The web app lives at crowdly.cloud/editor/ (EDITOR_BASE defaults to that)
// and at editor.crowdly.cloud/ (built with EDITOR_BASE=/). It reuses the
// platform's code from the repo root through the `@/` alias, so `@/` here
// means the same thing it does in root src/ — that's what lets platform
// components import their own `@/...` dependencies unchanged.
const base = process.env.EDITOR_BASE ?? "/editor/";
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@web", replacement: path.resolve(__dirname, "./src") },
      { find: "@", replacement: path.resolve(repoRoot, "src") },
      // Automerge's "browser" build imports a .wasm file directly, which
      // needs a Vite wasm plugin; its base64 build inlines the same wasm
      // and works everywhere (used for live co-editing).
      {
        find: /^@automerge\/automerge$/,
        replacement: path.resolve(repoRoot, "node_modules/@automerge/automerge/dist/mjs/entrypoints/fullfat_base64.js"),
      },
    ],
    // One copy of React (and friends) for both trees.
    dedupe: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    fs: { allow: [repoRoot] },
    // Everything outside the app's own base path is the backend, including
    // the /crdt-sync WebSocket used for live co-editing.
    proxy: {
      [`^/(?!${base.replace(/^\/|\/$/g, "") || "__none__"}(/|$)).*`]: {
        target: process.env.EDITOR_API_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
