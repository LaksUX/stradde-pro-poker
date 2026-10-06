import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Settings } from 'lucide-react'
import { PageSpinner } from '../components/ui/spinner'
import { Button } from '../components/ui/button'
import { useCountUp } from '../hooks/useCountUp'
import { toChips } from '../lib/chips'
import { cn } from 'cn'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { toast } from '../lib/toast'
import {
  checkLock,
  exportBook,
  fetchCard,
  hasLock,
  loadBook,
  mergeImport,
  nightNet,
  removeLock,
  saveBook,
  setLock,
  totalNet,
  type CardNight,
  type LocalBook,
} from '../lib/playerCard'

function signed(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US')
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0'
}

function tone(n: number | null): string {
  if (n == null || n === 0) return 'text-muted'
  return n > 0 ? 'text-win' : 'text-error'
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// A beforeinstallprompt event, only on browsers that fire it (Chrome/Android).
type InstallEvent = Event & { prompt: () => Promise<void> }

// Points the page at a manifest unique to this card so "Install" / "Add to
// Home Screen" saves THIS card — start_url carries the token, so the
// installed app opens straight to it with no sign-in. Restores the app's own
// manifest on leave.
function useCardManifest(token: string | undefined, title: string) {
  useEffect(() => {
    if (!token) return
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const prevHref = link?.getAttribute('href') ?? null
    const prevTitle = document.title
    const origin = window.location.origin
    const manifest = {
      id: `/c/${token}`,
      name: title,
      short_name: title.slice(0, 12),
      start_url: `${origin}/c/${token}`,
      scope: `${origin}/`,
      display: 'standalone',
      theme_color: '#e5383b',
      background_color: '#eef1f5',
      icons: [
        { src: `${origin}/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${origin}/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
      ],
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }))
    link?.setAttribute('href', url)
    document.title = title
    let appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    const prevApple = appleTitle?.content
    if (!appleTitle) {
      appleTitle = document.createElement('meta')
      appleTitle.name = 'apple-mobile-web-app-title'
      document.head.appendChild(appleTitle)
    }
    appleTitle.content = title
    return () => {
      if (link && prevHref) link.setAttribute('href', prevHref)
      document.title = prevTitle
      if (appleTitle && prevApple != null) appleTitle.content = prevApple
      URL.revokeObjectURL(url)
    }
  }, [token, title])
}

// MVP 2.0 player card (/c/:token): public, no sign-in. Results come from the
// host; notes and hidden nights are saved only on this phone.
export function PlayerCard() {
  const { token } = useParams()
  const [book, setBook] = useState<LocalBook>(() =>
    token ? loadBook(token) : { card: null, notes: {}, hidden: {}, syncedAt: null }
  )
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'offline'>(
    book.card ? 'ready' : 'loading'
  )
  const [openNight, setOpenNight] = useState<string | null>(null)
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const [locked, setLocked] = useState(() => (token ? hasLock(token) : false))
  const [settingsOpen, setSettingsOpen] = useState(false)

  const title = book.card
    ? `${book.card.group ?? 'Game night'} · ${book.card.name ?? 'Me'}`
    : 'Your card'
  useCardManifest(token, title)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetchCard(token)
      .then((card) => {
        if (cancelled) return
        if (!card) {
          setStatus('invalid')
          return
        }
        setBook((prev) => {
          const next = { ...prev, card, syncedAt: new Date().toISOString() }
          saveBook(token, next)
          return next
        })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus((s) => (s === 'loading' ? 'offline' : s))
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault()
      setInstallEvent(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function update(patch: Partial<LocalBook>) {
    if (!token) return
    setBook((prev) => {
      const next = { ...prev, ...patch }
      saveBook(token, next)
      return next
    })
  }

  const nights = useMemo(
    () => (book.card?.nights ?? []).filter((n) => !book.hidden[n.game_id]),
    [book.card, book.hidden]
  )
  const net = totalNet(nights)
  const shownNet = useCountUp(net)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)

  if (token && locked) {
    return <LockScreen title={title} onCheck={(pin) => checkLock(token, pin)} onUnlock={() => setLocked(false)} />
  }

  if (status === 'loading') return <PageSpinner />

  if (status === 'invalid' || (status === 'offline' && !book.card)) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center p-6 text-center">
        <h1 className="type-page-title text-ink">
          {status === 'invalid' ? 'This card link is no longer valid' : "Can't reach the card right now"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {status === 'invalid'
            ? 'Ask your host for a fresh link.'
            : 'Check your connection and open it again.'}
        </p>
      </div>
    )
  }


  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted">{book.card?.group ?? 'Game night'}</p>
          <h1 className="mt-0.5 text-3xl font-bold text-ink">Hi {book.card?.name ?? 'there'}</h1>
        </div>
        <button
          type="button"
          aria-label="Lock and backup"
          onClick={() => setSettingsOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline text-muted hover:bg-surface-strong"
        >
          <Settings className="h-[18px] w-[18px]" />
        </button>
      </div>
      {token && (
        <CardSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          token={token}
          book={book}
          onImport={(next) => update({ notes: next.notes, hidden: next.hidden })}
        />
      )}

      <div className="mt-5 rounded-xl border border-hairline bg-canvas p-5">
        <div className="flex items-center justify-between">
          <span className="type-label-caption text-muted">
            Your book · {nights.length} night{nights.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className={cn('type-figure-hero mt-3', tone(net))}>{signed(shownNet)}</p>
        <p className="mt-2 text-xs text-muted">
          {book.syncedAt
            ? status === 'offline'
              ? 'Offline — showing what was saved on this phone'
              : 'Up to date'
            : ''}
        </p>
      </div>

      {!standalone && (installEvent || isIos) && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Keep this card on your phone</p>
            {installEvent ? (
              <>
                <p className="mt-0.5 text-xs text-muted">One tap opens it, no sign-in.</p>
                <Button size="sm" className="mt-2" onClick={() => installEvent.prompt()}>
                  Add to Home Screen
                </Button>
              </>
            ) : (
              <p className="mt-0.5 text-xs text-muted">
                Tap the Share button in Safari, then “Add to Home Screen”.
              </p>
            )}
          </div>
        </div>
      )}

      <h2 className="type-label-caption mt-6 mb-2 text-muted">Nights</h2>
      {nights.length === 0 ? (
        <p className="rounded-xl border border-hairline bg-canvas p-5 text-center text-sm text-muted">
          Nothing here yet. Your nights show up automatically.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
          {nights.map((n) => (
            <NightRow
              key={n.game_id}
              night={n}
              open={openNight === n.game_id}
              note={book.notes[n.game_id] ?? ''}
              onToggle={() => setOpenNight(openNight === n.game_id ? null : n.game_id)}
              onNote={(text) => update({ notes: { ...book.notes, [n.game_id]: text } })}
              onHide={() => {
                update({ hidden: { ...book.hidden, [n.game_id]: true } })
                setOpenNight(null)
              }}
            />
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        Only you can see this card. Notes stay on this phone.
      </p>
    </div>
  )
}

function NightRow({
  night,
  open,
  note,
  onToggle,
  onNote,
  onHide,
}: {
  night: CardNight
  open: boolean
  note: string
  onToggle: () => void
  onNote: (text: string) => void
  onHide: () => void
}) {
  const net = nightNet(night)
  const buyins = Number(night.buyins)
  return (
    <div className="border-b border-hairline last:border-b-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{formatDay(night.at)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {night.status === 'live' ? 'In play · ' : ''}
            {buyins} entr{buyins === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <span className={cn('type-figure-md', tone(net))}>
          {net == null ? '…' : signed(net)}
        </span>
      </button>
      {night.settlements && night.settlements.length > 0 && (
        <div className="mx-4 mb-3 rounded-md bg-surface-soft px-3 py-2">
          <p className="type-label-caption text-muted">Settlement</p>
          {night.settlements.map((st, i) => (
            <p key={i} className="mt-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-body">
                {st.direction === 'pay' ? `Pay ${st.other_name ?? 'someone'}` : `${st.other_name ?? 'Someone'} pays you`}
              </span>
              <span className={cn('type-figure-md', st.direction === 'pay' ? 'text-error' : 'text-win')}>
                {toChips(Number(st.amount), night.chip_ratio).toLocaleString('en-US')}
              </span>
            </p>
          ))}
        </div>
      )}
      {open && (
        <div className="px-4 pb-4">
          <label className="type-label-caption text-muted" htmlFor={`note-${night.game_id}`}>
            Your note · only on this phone
          </label>
          <textarea
            id={`note-${night.game_id}`}
            rows={3}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            className="mt-2 w-full resize-none rounded-md border border-hairline bg-surface-soft p-3 text-sm text-ink outline-none focus:border-primary"
          />
          <button type="button" onClick={onHide} className="mt-2 text-xs font-semibold text-muted hover:text-ink">
            Hide this night from my book
          </button>
        </div>
      )}
    </div>
  )
}

function LockScreen({
  title,
  onCheck,
  onUnlock,
}: {
  title: string
  onCheck: (pin: string) => Promise<boolean>
  onUnlock: () => void
}) {
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)

  async function press(d: string) {
    const next = (pin + d).slice(0, 4)
    setPin(next)
    setWrong(false)
    if (next.length === 4) {
      if (await onCheck(next)) onUnlock()
      else {
        setWrong(true)
        setPin('')
      }
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-xs flex-col items-center justify-center p-6">
      <h1 className="type-page-title text-center text-ink">{title}</h1>
      <p className="mt-1 text-sm text-muted">{wrong ? 'Wrong PIN, try again' : 'Enter your PIN'}</p>
      <div className="my-6 flex gap-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn('h-4 w-4 rounded-full border-2 border-primary', i < pin.length && 'bg-primary')}
          />
        ))}
      </div>
      <div className="grid w-full grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            className="h-16 rounded-xl border border-hairline bg-canvas text-2xl font-semibold text-ink active:bg-surface-strong"
          >
            {d}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => press('0')}
          className="h-16 rounded-xl border border-hairline bg-canvas text-2xl font-semibold text-ink active:bg-surface-strong"
        >
          0
        </button>
        <button
          type="button"
          aria-label="Delete"
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="h-16 rounded-xl text-sm font-semibold text-muted"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function CardSettings({
  open,
  onOpenChange,
  token,
  book,
  onImport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  book: LocalBook
  onImport: (next: LocalBook) => void
}) {
  const [pin, setPin] = useState('')
  const [lockOn, setLockOn] = useState(() => hasLock(token))

  async function saveLock() {
    if (!/^[0-9]{4}$/.test(pin)) {
      toast.error('PIN must be 4 digits')
      return
    }
    await setLock(token, pin)
    setLockOn(true)
    setPin('')
    toast.success('Card locked. It will ask for the PIN next time.')
  }

  function clearLock() {
    removeLock(token)
    setLockOn(false)
    toast.success('Lock removed')
  }

  function download() {
    const blob = new Blob([JSON.stringify(exportBook(token, book), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `straddle-card-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(file: File | undefined) {
    if (!file) return
    try {
      onImport(mergeImport(token, book, await file.text()))
      toast.success('Backup restored')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read that file')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Lock &amp; backup</SheetTitle>
          <SheetDescription>Both stay on this phone. Nothing here is sent to your host.</SheetDescription>
        </SheetHeader>

        <h3 className="type-label-caption mt-4 text-muted">PIN lock</h3>
        {lockOn ? (
          <div className="mt-2 flex items-center justify-between rounded-md border border-hairline p-3">
            <span className="text-sm text-ink">This card asks for a PIN</span>
            <Button size="sm" variant="outline" onClick={clearLock}>
              Remove
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              aria-label="New 4-digit PIN"
              placeholder="4 digits"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="h-12 w-full rounded-md border border-hairline bg-surface-soft px-3 tracking-[0.5em] text-ink outline-none focus:border-primary"
            />
            <Button disabled={pin.length !== 4} onClick={saveLock}>
              Lock
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          Forgot it? Remove the card from your Home Screen and open your link again. Only your notes are lost.
        </p>

        <h3 className="type-label-caption mt-5 text-muted">Backup</h3>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" block onClick={download}>
            Export file
          </Button>
          <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-full border border-hairline bg-canvas px-4 text-sm font-semibold text-ink hover:bg-surface-strong">
            Import file
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                importFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </SheetContent>
    </Sheet>
  )
}
