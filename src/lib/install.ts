import { useEffect, useState } from 'react'

// "Add to Home Screen" across mobile browsers. Chrome, Edge and Samsung
// Internet hand us a prompt event we can trigger with one tap; iPhone and
// in-app browsers (WhatsApp, Instagram and friends) never do, so those get
// short, specific instructions instead.

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

// Registered at import time (main.tsx imports this file) because the event can
// fire before any React page has mounted.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    notify()
  })
}

export type InstallMode = 'installed' | 'native' | 'ios' | 'android' | 'inapp' | 'none'

export function detectInstallMode(): InstallMode {
  if (typeof window === 'undefined') return 'none'
  const ua = navigator.userAgent
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone || installed) return 'installed'
  if (deferred) return 'native'
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const android = /android/i.test(ua)
  const inApp = /FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|MicroMessenger|GSA\/|; wv\)/i.test(ua)
  if (inApp && (ios || android)) return 'inapp'
  if (ios) return 'ios'
  if (android) return 'android'
  return 'none'
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const ev = deferred
  deferred = null
  notify()
  try {
    await ev.prompt()
    const { outcome } = await ev.userChoice
    return outcome === 'accepted'
  } catch {
    return false
  }
}

export function useInstallMode(): InstallMode {
  const [mode, setMode] = useState<InstallMode>(() => detectInstallMode())
  useEffect(() => {
    const update = () => setMode(detectInstallMode())
    listeners.add(update)
    update()
    return () => {
      listeners.delete(update)
    }
  }, [])
  return mode
}
