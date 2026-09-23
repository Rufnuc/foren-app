import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA: installable + offline app shell. The manifest is DISGUISE-SAFE — the
    // installed name, icon and description all read as an ordinary puzzle game,
    // never "Foren". The heavy on-device assets (the AI model, the ZK artifacts)
    // are NOT precached; they load on demand.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon-32x32.png', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Puzzle',
        short_name: 'Puzzle',
        description: 'A collection of number and word puzzles.',
        theme_color: '#1A1A1A',
        background_color: '#1A1A1A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // Let the large on-device assets be fetched normally, not SPA-rewritten.
        navigateFallbackDenylist: [/^\/models\//, /^\/zk\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
