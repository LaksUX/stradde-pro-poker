import { supabase } from './supabase'

// See supabase/functions/send-push/index.ts's own header comment for the
// full manual setup this depends on (VAPID keys, Edge Function secrets).
// Until that's done, VITE_VAPID_PUBLIC_KEY is unset and everything here
// fails closed via isPushSupported() rather than throwing — a build
// without push configured should just not offer the toggle, not break.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC_KEY
  )
}

// Web Push subscribe() needs the VAPID public key as a raw Uint8Array, not
// the base64url string everything else hands it around as.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0))
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) return false
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  return existing != null
}

// Idempotent — re-calling this for an already-subscribed browser is a
// no-op past the first subscribe() (the browser returns the same
// subscription), and the upsert below just re-saves the same row.
export async function subscribeToPush(profileId: string): Promise<void> {
  if (!isPushSupported()) throw new Error('Push notifications are not supported on this device.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this site — allow them in your browser settings and try again.'
        : 'Notification permission was not granted.'
    )
  }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // TS's lib.dom typing wants Uint8Array<ArrayBuffer> specifically;
      // Uint8Array.from's return type is the wider Uint8Array<ArrayBufferLike>
      // even though it's always a real ArrayBuffer at runtime here.
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth || !subscription.endpoint) {
    throw new Error('Browser returned an incomplete push subscription.')
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: profileId,
      endpoint: subscription.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}
