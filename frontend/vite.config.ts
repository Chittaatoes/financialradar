import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.png", "apple-touch-icon.png", "masked-icon.svg"],
      manifest: false,

      workbox: {
        // Pre-cache ALL build output so every lazy-loaded chunk works offline.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}"],
        globIgnores: ["**/node_modules/**"],

        // Don't use navigateFallback for API routes.
        navigateFallbackDenylist: [/^\/api\//],

        // Increase limit to handle large vendor chunks (tesseract, recharts, etc.)
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB

        // Remove stale precache entries from previous SW versions.
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          // ── ALL /api/* routes are NEVER cached by the service worker ──────────
          // Offline reads/mutations are handled by React Query + IndexedDB.
          // Caching API responses in the SW causes blank screens on reconnect.
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api"),
            handler: "NetworkOnly",
          },

          // ── Google Fonts ───────────────────────────────────────────────────────
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // ── App JS/CSS chunks (lazy-loaded pages, vendor splits) ───────────────
          // StaleWhileRevalidate: serve from cache instantly, update in background.
          {
            urlPattern: ({ request }) =>
              request.destination === "script" || request.destination === "style",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "app-chunks-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // ── Static assets (images, icons, fonts) ──────────────────────────────
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],

  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },

  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../shared"),
      "@assets": path.resolve(__dirname, "../attached_assets"),
      "react": path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":    ["react", "react-dom", "react/jsx-runtime"],
          "vendor-query":    ["@tanstack/react-query"],
          "vendor-recharts": ["recharts"],
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-select",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-alert-dialog",
          ],
          "vendor-dexie": ["dexie"],
        },
      },
    },
  },
});
