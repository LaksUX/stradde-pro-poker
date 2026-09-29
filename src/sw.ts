/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'

// Switched from vite-plugin-pwa's generateSW strategy to injectManifest so
// this file can add push/notificationclick handling — generateSW writes its
// own sw.js with no hook for custom code. Everything below the precaching
// setup replicates what generateSW + registerType: 'autoUpdate' gave us for
// free (skipWaiting/clientsClaim, the navigateFallbackDenylist for /t/ and
// /join/) so switching strategies doesn't change any existing behavior.

self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Share Table / RSVP and Join must always hit the network for fresh
// pending-request and live-table state — never serve a stale cached index
// for those paths. Same denylist vite.config.ts's workbox option used to
// set under generateSW.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/t\//, /^\/join\//],
  })
)

// Payload shape sent by the send-push Edge Function — see
// supabase/functions/send-push/index.ts.
type PushPayload = { title: string; body: string; url?: string }

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload: PushPayload
  try {
    payload = event.data.json()
  } catch {
    return
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: payload.url ?? '/' },
    })
  )
})

// Focuses an already-open tab and navigates it rather than always opening a
// new one — a host tapping a "new buy-in request" notification almost
// certainly already has the app open in some tab.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) (client as WindowClient).navigate(url).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
