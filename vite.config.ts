import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// "1.0" here, not package.json's "version" (which stays real semver,
// "1.0.0") — this is a separate, display-only base so appending the build
// number below gives "1.0.71", not "1.0.0.71".
const VERSION_BASE = '1.0'

// Total commit count is a build counter that only ever goes up, with no
// state to track ourselves — every new commit on main is a new Vercel
// build, so this increments exactly once per build. Falls back to a
// timestamp if git isn't available (e.g. a from-scratch checkout with no
// history), so a missing .git directory can't break the build.
function buildNumber(): string {
  try {
    return execSync('git rev-list --count HEAD').toString().trim()
  } catch {
    return String(Date.now())
  }
}

// See REQUIREMENTS.md "Stack" and "Theme" — Tailwind v4 CSS-first config
// (no tailwind.config.js), PWA via vite-plugin-pwa, no dark mode variant.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${VERSION_BASE}.${buildNumber()}`),
  },
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
