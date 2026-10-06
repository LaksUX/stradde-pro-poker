import { useEffect, useState } from 'react'
import { Download, MoreVertical, PlusSquare, Share } from 'lucide-react'
import { promptInstall, useInstallMode } from '../../lib/install'
import { toast } from '../../lib/toast'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './sheet'
import { Button } from './button'

const DISMISS_KEY = 'straddle:install-dismissed'
const MAX_AUTO_PROMPTS = 3

function dismissCount(): number {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) || 0)
  } catch {
    return 0
  }
}

function Steps({ items }: { items: { icon: React.ReactNode; text: React.ReactNode }[] }) {
  return (
    <ol className="mt-4 flex flex-col gap-3">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg bg-surface-soft p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
            {i + 1}
          </span>
          <span className="flex-1 text-sm text-ink">{it.text}</span>
          <span className="text-primary">{it.icon}</span>
        </li>
      ))}
    </ol>
  )
}

// Players lose links in chat history and never come back. This asks them to put
// the card on their home screen: a one-tap prompt where the browser allows it,
// and short step-by-step instructions where it does not (iPhone, in-app
// browsers, Android browsers that hold the prompt back). It opens by itself a
// moment after the card loads, a few visits in a row, and always stays
// available as an inline banner until the card is installed.
export function InstallPrompt({ label }: { label: string }) {
  const mode = useInstallMode()
  const [open, setOpen] = useState(false)
  const actionable = mode !== 'installed' && mode !== 'none'

  useEffect(() => {
    if (!actionable) return
    let seen = false
    try {
      seen = sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      // storage blocked: still show once per load
    }
    if (seen || dismissCount() >= MAX_AUTO_PROMPTS) return
    const t = setTimeout(() => setOpen(true), 1200)
    return () => clearTimeout(t)
  }, [actionable])

  function notNow() {
    setOpen(false)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
      localStorage.setItem(DISMISS_KEY, String(dismissCount() + 1))
    } catch {
      // nothing to remember
    }
  }

  async function install() {
    const ok = await promptInstall()
    if (ok) {
      setOpen(false)
      toast.success('Added. Look for it on your home screen.')
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Copied. Paste it into your browser.')
    } catch {
      toast.error('Could not copy')
    }
  }

  if (!actionable) return null

  return (
    <>
      <button
        type="button"
        onClick={() => (mode === 'native' ? install() : setOpen(true))}
        className="mt-3 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left"
      >
        <Download className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Keep this card on your phone</span>
          <span className="block text-xs text-muted">So you never lose the link</span>
        </span>
        <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-on-primary">Add</span>
      </button>

      <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : notNow())}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Keep {label} on your phone</SheetTitle>
          </SheetHeader>
          <p className="mt-1 text-sm text-body">
            Add it to your home screen. One tap opens your card, and you never have to find the link again.
          </p>

          {mode === 'native' && (
            <Button block className="mt-5" onClick={install}>
              Add to Home Screen
            </Button>
          )}

          {mode === 'ios' && (
            <Steps
              items={[
                { text: <>Tap the <b>Share</b> button at the bottom of Safari</>, icon: <Share className="h-5 w-5" /> },
                { text: <>Scroll down and tap <b>Add to Home Screen</b></>, icon: <PlusSquare className="h-5 w-5" /> },
                { text: <>Tap <b>Add</b>. Open it from your home screen</>, icon: <Download className="h-5 w-5" /> },
              ]}
            />
          )}

          {mode === 'android' && (
            <Steps
              items={[
                { text: <>Tap the <b>menu</b> (three dots) in your browser</>, icon: <MoreVertical className="h-5 w-5" /> },
                { text: <>Tap <b>Install app</b> or <b>Add to Home screen</b></>, icon: <PlusSquare className="h-5 w-5" /> },
                { text: <>Tap <b>Install</b>. Open it from your home screen</>, icon: <Download className="h-5 w-5" /> },
              ]}
            />
          )}

          {mode === 'inapp' && (
            <>
              <Steps
                items={[
                  { text: <>Tap the <b>menu</b> or compass icon in this window</>, icon: <MoreVertical className="h-5 w-5" /> },
                  { text: <>Choose <b>Open in browser</b> (Safari or Chrome)</>, icon: <Share className="h-5 w-5" /> },
                  { text: <>Then add it to your home screen from there</>, icon: <PlusSquare className="h-5 w-5" /> },
                ]}
              />
              <Button variant="secondary" block className="mt-3" onClick={copyLink}>
                Copy link for my browser
              </Button>
            </>
          )}

          <button
            type="button"
            onClick={notNow}
            className="mt-4 w-full text-center text-sm font-semibold text-muted hover:text-ink"
          >
            Not now
          </button>
        </SheetContent>
      </Sheet>
    </>
  )
}
