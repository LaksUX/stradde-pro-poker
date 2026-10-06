import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { fetchCard, loadBook, saveBook } from '../lib/playerCard'
import { chipMultiplier } from '../lib/chips'
import {
  cardTotal,
  deleteOwnGame,
  includeOwn,
  knownCards,
  newId,
  ownGames,
  ownNet,
  rememberCard,
  saveOwnGame,
  setIncludeOwn,
  type OwnGame,
} from '../lib/myBook'
import { useCountUp } from '../hooks/useCountUp'

function signed(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US')
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0'
}
function tone(n: number): string {
  return n > 0 ? 'text-win' : n < 0 ? 'text-error' : 'text-muted'
}
function today(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

// /book: every group card this phone has opened, plus nights the player logs
// himself at places that do not use Straddle. Local to this phone.
export function MyBook() {
  const [cards, setCards] = useState(() => knownCards())
  const [own, setOwn] = useState<OwnGame[]>(() => ownGames())
  const [withOwn, setWithOwn] = useState(() => includeOwn())
  const [editing, setEditing] = useState<OwnGame | 'new' | null>(null)
  const [, setTick] = useState(0)

  // Quietly refresh each saved card; keep the phone's copy if offline.
  useEffect(() => {
    let cancelled = false
    for (const c of knownCards()) {
      fetchCard(c.token)
        .then((card) => {
          if (cancelled || !card) return
          saveBook(c.token, { ...loadBook(c.token), card, syncedAt: new Date().toISOString() })
          rememberCard(c.token, card)
          setCards(knownCards())
          setTick((t) => t + 1)
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [])

  const hostTotal = cards.reduce((s, c) => s + cardTotal(c.token), 0)
  const ownTotal = own.reduce((s, g) => s + ownNet(g), 0)
  const total = hostTotal + (withOwn ? ownTotal : 0)
  const shown = useCountUp(total)
  const places = useMemo(() => Array.from(new Set(own.map((g) => g.place))), [own])

  function refreshOwn() {
    setOwn(ownGames())
  }

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10 sm:p-6">
      <h1 className="text-3xl font-bold text-ink">My book</h1>
      <p className="mt-1 text-xs text-muted">Kept on this phone only.</p>

      <div className="mt-5 rounded-xl border border-hairline bg-canvas p-5">
        <span className="type-label-caption text-muted">All together</span>
        <p className={cn('type-figure-hero mt-3', tone(total))}>{signed(shown)}</p>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm text-body">
          Include my own games
          <Switch
            checked={withOwn}
            onCheckedChange={(v) => {
              setWithOwn(v)
              setIncludeOwn(v)
            }}
          />
        </label>
      </div>

      <h2 className="type-label-caption mt-6 mb-2 text-muted">Groups</h2>
      {cards.length === 0 ? (
        <p className="rounded-xl border border-hairline bg-canvas p-5 text-center text-sm text-muted">
          Open the card link a host sends you and it appears here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
          {cards.map((c) => {
            const t = cardTotal(c.token)
            return (
              <Link
                key={c.token}
                to={`/c/${c.token}`}
                className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{c.group ?? 'Game night'}</span>
                  <span className="block text-xs text-muted">{c.name ?? ''}</span>
                </span>
                <span className={cn('type-figure-md', tone(t))}>{signed(t)}</span>
                <ChevronRight className="h-4 w-4 text-muted" />
              </Link>
            )
          })}
        </div>
      )}

      <div className="mt-6 mb-2 flex items-center justify-between">
        <h2 className="type-label-caption text-muted">My own games</h2>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex items-center gap-1 text-xs font-bold text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> Add my own game
        </button>
      </div>
      {own.length === 0 ? (
        <p className="rounded-xl border border-hairline bg-canvas p-5 text-center text-sm text-muted">
          Played somewhere that does not use Straddle? Add the night yourself.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
          {own.map((g) => {
            const n = ownNet(g)
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setEditing(g)}
                className="flex w-full items-center gap-3 border-b border-hairline px-4 py-3 text-left last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{g.place}</span>
                  <span className="block text-xs text-muted">
                    {formatDate(g.date)} · {g.entries} entr{g.entries === 1 ? 'y' : 'ies'} · self-reported
                  </span>
                </span>
                <span className={cn('type-figure-md', tone(n))}>{signed(n)}</span>
              </button>
            )
          })}
        </div>
      )}

      <OwnGameSheet
        game={editing}
        places={places}
        onClose={() => setEditing(null)}
        onSaved={() => {
          refreshOwn()
          setEditing(null)
        }}
      />
    </div>
  )
}

function OwnGameSheet({
  game,
  places,
  onClose,
  onSaved,
}: {
  game: OwnGame | 'new' | null
  places: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [place, setPlace] = useState('')
  const [date, setDate] = useState(today())
  const [entries, setEntries] = useState('')
  const [finished, setFinished] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (game === null) return
    if (game === 'new') {
      setPlace('')
      setDate(today())
      setEntries('')
      setFinished('')
    } else {
      setPlace(game.place)
      setDate(game.date)
      setEntries(String(game.entries))
      setFinished(String(game.finished))
    }
    setError(null)
  }, [game])

  const e = Number(entries)
  const f = Number(finished)
  const preview = entries !== '' && finished !== '' ? Math.round(f - e * chipMultiplier('1:1')) : null

  function save() {
    if (!place.trim()) return setError('Where did you play?')
    if (!(e >= 0) || entries === '') return setError('How many entries?')
    if (!(f >= 0) || finished === '') return setError('What did you finish with? Type 0 if nothing.')
    saveOwnGame({
      id: game && game !== 'new' ? game.id : newId(),
      place: place.trim().slice(0, 60),
      date,
      entries: e,
      finished: f,
    })
    onSaved()
  }

  function remove() {
    if (game && game !== 'new') deleteOwnGame(game.id)
    onSaved()
  }

  return (
    <Sheet open={game !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{game === 'new' ? 'Add my own game' : 'My own game'}</SheetTitle>
        </SheetHeader>
        <p className="mt-1 text-xs text-muted">Only on this phone. No host sees it.</p>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="own-place">Where</Label>
            <Input
              id="own-place"
              list="own-places"
              className="h-12"
              placeholder="Royal Club"
              value={place}
              onChange={(ev) => setPlace(ev.target.value)}
            />
            <datalist id="own-places">
              {places.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="own-date">Date</Label>
            <Input id="own-date" type="date" className="h-12" value={date} onChange={(ev) => setDate(ev.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="own-entries">Entries</Label>
              <Input
                id="own-entries"
                type="number"
                inputMode="numeric"
                className="h-12"
                value={entries}
                onChange={(ev) => setEntries(ev.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="own-finished">Finished with</Label>
              <Input
                id="own-finished"
                type="number"
                inputMode="numeric"
                className="h-12"
                value={finished}
                onChange={(ev) => setFinished(ev.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted">1 buy-in = 10,000.</p>
          {preview != null && (
            <p className="text-sm text-body">
              Result: <span className={cn('font-bold', tone(preview))}>{signed(preview)}</span>
            </p>
          )}
          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        <Button block className="mt-4" onClick={save}>
          Save
        </Button>
        {game && game !== 'new' && (
          <button type="button" onClick={remove} className="mt-3 w-full text-center text-sm font-semibold text-error">
            Delete this game
          </button>
        )}
      </SheetContent>
    </Sheet>
  )
}
