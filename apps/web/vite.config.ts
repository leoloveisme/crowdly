import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// The web app is a stand-alone app at the root of its own domain, talking
// to the backend at api.<that domain> (VITE_API_BASE_URL at build time — see
// Documentation/Web_app_deploy.md). It reuses the platform's code from the
// repo root through the `@/` alias, so `@/` here means the same thing it does
// in root src/ — that's what lets platform components import their own
// `@/...` dependencies unchanged.
const repoRoot = path.resolve(__dirname, "../..");
const apiTarget = process.env.WEBAPP_API_TARGET ?? "http://localhost:4000";

// Dev only: everything that isn't Vite's own or a public file goes to the
// backend, so API calls stay same-origin like the platform's dev setup.
// Page loads (Accept: text/html) get the app instead, because some app
// routes share a path with an API route (/shelves is both).
const VITE_OWN = "@vite|@fs|@id|@react-refresh|src/|node_modules/|icon\\.svg|manifest\\.webmanifest|sw\\.js|favicon";
const servePageLoads = (req: { headers: Record<string, string | string[] | undefined> }) =>
  String(req.headers.accept ?? "").includes("text/html") ? "/index.html" : undefined;

export default defineConfig({
  base: "/",
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
    proxy: {
      // Live co-editing WebSocket. Its own rule, so Vite's HMR socket on "/"
      // is never proxied.
      "/crdt-sync": { target: apiTarget, changeOrigin: true, ws: true },
      [`^/(?!(${VITE_OWN})).+`]: { target: apiTarget, changeOrigin: true, bypass: servePageLoads },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
