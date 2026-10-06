import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, NotebookPen } from 'lucide-react'
import { PageSpinner } from '../components/ui/spinner'
import { Button } from '../components/ui/button'
import { useCountUp } from '../hooks/useCountUp'
import { toChips } from '../lib/chips'
import { cn } from 'cn'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet'
import {
  fetchCard,
  loadBook,
  nightNet,
  saveBook,
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
// host; notes are saved only on this phone.
export function PlayerCard() {
  const { token } = useParams()
  const [book, setBook] = useState<LocalBook>(() =>
    token ? loadBook(token) : { card: null, notes: {}, syncedAt: null }
  )
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'offline'>(
    book.card ? 'ready' : 'loading'
  )
  const [noteNight, setNoteNight] = useState<string | null>(null)
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)

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

  const nights = book.card?.nights ?? []
  const net = totalNet(nights)
  const shownNet = useCountUp(net)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)

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
      </div>

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
              note={book.notes[n.game_id] ?? ''}
              onOpen={() => setNoteNight(n.game_id)}
            />
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        Only you can see this card. Notes stay on this phone.
      </p>

      <NoteSheet
        night={nights.find((n) => n.game_id === noteNight) ?? null}
        note={noteNight ? (book.notes[noteNight] ?? '') : ''}
        onChange={(text) => noteNight && update({ notes: { ...book.notes, [noteNight]: text } })}
        onClose={() => setNoteNight(null)}
      />
    </div>
  )
}

function NightRow({ night, note, onOpen }: { night: CardNight; note: string; onOpen: () => void }) {
  const net = nightNet(night)
  const buyins = Number(night.buyins)
  return (
    <div className="border-b border-hairline last:border-b-0">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{formatDay(night.at)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {night.status === 'live' ? 'In play · ' : ''}
            {buyins} entr{buyins === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <span className={cn('type-figure-md', tone(net))}>{net == null ? '…' : signed(net)}</span>
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
      <button
        type="button"
        onClick={onOpen}
        className="mx-4 mb-3 flex w-[calc(100%-2rem)] items-start gap-2 text-left text-xs text-muted hover:text-ink"
      >
        <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className={cn('min-w-0 flex-1 break-words', note ? 'text-body' : '')}>
          {note ? note : 'Add a note'}
        </span>
      </button>
    </div>
  )
}

// A bottom sheet for the night's private note. Saved on this phone as you type.
function NoteSheet({
  night,
  note,
  onChange,
  onClose,
}: {
  night: CardNight | null
  note: string
  onChange: (text: string) => void
  onClose: () => void
}) {
  return (
    <Sheet open={night != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{night ? formatDay(night.at) : 'Note'}</SheetTitle>
        </SheetHeader>
        <p className="mt-1 text-xs text-muted">Your private note. It stays on this phone.</p>
        <textarea
          aria-label="Your note"
          rows={5}
          autoFocus
          value={note}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What do you want to remember about this night?"
          className="mt-4 w-full resize-none rounded-md border border-hairline bg-surface-soft p-3 text-base text-ink outline-none focus:border-primary"
        />
        <Button block className="mt-4" onClick={onClose}>
          Done
        </Button>
      </SheetContent>
    </Sheet>
  )
}
