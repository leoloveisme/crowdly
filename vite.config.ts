import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // Listen on all IPv4 interfaces so mobile devices on the LAN can reach Vite
    host: "0.0.0.0",
    port: 8080,
    allowedHosts: ['crowdly.platform'],
    watch: {
      // Avoid watching large legacy build artifacts to stay under OS file-watch limits
      // and noisy virtual environments (Python, etc.). This helps prevent
      // ENOSPC errors when the OS inotify watcher limit is low.
      ignored: [
        "**/web editor/dist/**",
        "**/.venv/**",
        "**/venv/**",
      ],
    },
    // Proxy API requests to the backend dev server on port 4000 so the
    // frontend can use same-origin relative URLs (works better on mobile).
    proxy: {
      "/auth": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/story-titles": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/stories": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/chapters": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/chapter-revisions": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/screenplay-revisions": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/screenplays": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/screenplay-scenes": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/screenplay-blocks": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/reactions": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/comments": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/paragraph-branches": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/users": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/groups": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/creative-spaces": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/creative-space-items": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/profiles": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/public-profiles": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/search": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/admin/invitations": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/admin/applications": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/admin/users": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/locales": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/interface-translations": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/alpha/validate": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/alpha/apply": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/alpha/check-access": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // Friends/messaging/notifications API — namespaced under /api because
      // /friends and /conversations would otherwise collide with SPA page
      // routes of the same bare name.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        // No path rewrite — the backend mounts these routers at /api itself
        // (see server.js), so the prefix must pass through unchanged.
        // SSE (/api/events): keep the connection open instead of buffering/timing it out.
        proxyTimeout: 0,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
