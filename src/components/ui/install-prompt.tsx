import { useEffect, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { promptInstall, useInstallMode, type InstallMode } from '../../lib/install'
import { toast } from '../../lib/toast'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './sheet'
import { Button } from './button'

const DISMISS_KEY = 'straddle:install-dismissed'
const MAX_AUTO_PROMPTS = 3

// Browsers without a one-tap install need the player to do the last step
// themselves; the card page is the page that gets saved.
function steps(mode: InstallMode): string[] {
  if (mode === 'ios')
    return ['Tap the Share button at the bottom of Safari', 'Choose "Add to Home Screen"', 'Tap Add. Your card opens from your home screen.']
  if (mode === 'inapp')
    return ['Tap Copy card link below', 'Open it in Safari (iPhone) or Chrome (Android)', 'Then add it to your home screen from the browser menu']
  return ['Tap the ⋮ menu at the top right of your browser', 'Choose "Install app" or "Add to Home screen"', 'Tap Install. Your card opens from your home screen.']
}

function dismissCount(): number {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) || 0)
  } catch {
    return 0
  }
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
      toast.success('Link copied')
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
        className="mt-3 flex w-full items-center gap-3 rounded-xl border border-hairline bg-canvas p-4 text-left"
      >
        <Download className="h-5 w-5 shrink-0 text-ink" />
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
            Keep a shortcut to your card, so you never have to find the link again.
          </p>

          {mode === 'native' && (
            <Button block className="mt-5" onClick={install}>
              Add to Home Screen
            </Button>
          )}

          {mode !== 'native' && (
            <ol className="mt-5 space-y-3 rounded-xl bg-surface-soft p-4 text-sm text-ink">
              {steps(mode).map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
          )}

          {mode === 'inapp' && (
            <Button variant="secondary" block className="mt-3" onClick={copyLink}>
              <Copy className="mr-1.5 h-4 w-4" /> Copy card link
            </Button>
          )}

          <button
            type="button"
            onClick={notNow}
            className="cta-soft mt-4 w-full py-2.5 text-sm font-semibold text-muted hover:text-ink"
          >
            Not now
          </button>
        </SheetContent>
      </Sheet>
    </>
  )
}
