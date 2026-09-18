import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// vite-plugin-pwa's registerType: 'autoUpdate' already configures the
// service worker itself to call skipWaiting()/clientsClaim() (see the
// generated sw.js), so a new deploy's worker takes control almost
// immediately. What it does NOT do on its own is refresh the page that's
// already open — the old JS keeps running in memory under the new worker
// until something reloads it, which on a client-side-only SPA (no further
// full navigations after the first load) can mean a stale build runs
// indefinitely. Verified live: after a deploy, a tab that was open before
// it kept serving the previous bundle through two navigations before this
// fix. Reloading once, automatically, the moment a new worker takes over
// closes that gap — the person just sees the app "catch up" to the latest
// version on its own, without a manual hard-refresh or clearing site data.
if ('serviceWorker' in navigator) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
