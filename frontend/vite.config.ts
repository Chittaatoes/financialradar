import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: false,

      workbox: {
        // Pre-cache ALL build output (JS chunks, CSS, HTML, images, fonts)
        // This ensures every lazy-loaded React.lazy() chunk works offline.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}"],
        globIgnores: ["**/node_modules/**"],

        // Don't use navigateFallback for API routes
        navigateFallbackDenylist: [/^\/api\//],

        // Increase max cached file size to handle large vendor chunks (tesseract, etc.)
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB

        runtimeCaching: [
          // Google Fonts — long-lived cache
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

          // App's own JS/CSS chunks (lazy-loaded pages, vendor splits)
          // StaleWhileRevalidate: serve from cache immediately, update in background
          {
            urlPattern: /\/assets\/.*\.(?:js|css)$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "app-chunks-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // Static assets (icons, images, fonts) — long-lived cache
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|woff2?|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // Auth endpoints — network only (never cache auth flows)
          {
            urlPattern: /\/api\/(auth|guest-login|logout).*/i,
            handler: "NetworkOnly",
            options: { fetchOptions: { credentials: "include" } },
          },

          // Core data endpoints — NetworkFirst with 5s timeout, fallback to cache
          {
            urlPattern:
              /\/api\/(dashboard|transactions|goals|budget|accounts|daily-focus|badges|finance-score|spending-insight|smart-save|debt-health|net-worth|profile|custom-categories|liabilities|streak|achievements|reports|score).*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-data-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 5,
              fetchOptions: { credentials: "include" },
            },
          },

          // All other API endpoints — NetworkFirst as catch-all
          {
            urlPattern: /\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-other-cache",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 5,
              fetchOptions: { credentials: "include" },
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
          "vendor-dexie":    ["dexie"],
        },
      },
    },
  },
});
