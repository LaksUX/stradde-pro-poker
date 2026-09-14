import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// See REQUIREMENTS.md "Stack" and "Theme" — Tailwind v4 CSS-first config
// (no tailwind.config.js), PWA via vite-plugin-pwa, no dark mode variant.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Poker Night',
        short_name: 'Poker Night',
        description:
          'Live buy-in and settlement tracking for home poker games — join by link, no install required to watch.',
        theme_color: '#ff385c', // Rausch — DESIGN-airbnb.md primary
        background_color: '#ffffff', // canvas — no dark mode, per DESIGN-airbnb.md
        display: 'standalone',
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
