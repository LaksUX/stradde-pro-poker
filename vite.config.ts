import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// See REQUIREMENTS.md "Stack" and "Theme" — Tailwind v4 CSS-first config
// (no tailwind.config.js), PWA via vite-plugin-pwa, no dark mode variant.
export default defineConfig({
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // apple-touch-icon.png was listed here but never actually existed in
      // public/ — index.html now points iOS at pwa-192x192.png directly
      // instead (see its apple-touch-icon link), so this only needs to
      // precache assets that are real.
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Straddle',
        short_name: 'Straddle',
        description:
          'Live buy-in and settlement tracking for home poker games — join by link, no install required to watch.',
        theme_color: '#ff7a29', // primary — DESIGN-dashboard.md
        background_color: '#0a0e17', // canvas — no dark-mode toggle, per DESIGN-dashboard.md
        // 'fullscreen' hides the OS status bar too, not just the browser
        // chrome that 'standalone' already removed — display_override lets
        // a browser that doesn't support fullscreen fall back to standalone
        // instead of ignoring the manifest's display mode entirely.
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Share Table / RSVP and Join must always hit the network for fresh
        // pending-request and live-table state — never serve a stale cached
        // version of a page whose entire point is being live.
        navigateFallbackDenylist: [/^\/t\//, /^\/join\//],
      },
    }),
  ],
})
