import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Building2, ChevronDown, ChevronRight, Home, Pencil, Plus } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { Tabs, SubTabsList, SubTabsTrigger, TabsContent } from '../components/ui/tabs'
import { fetchCard, loadBook, saveBook } from '../lib/playerCard'
import { chipMultiplier } from '../lib/chips'
import {
  cardTotal,
  deleteOwnGame,
  knownCards,
  newId,
  ownGames,
  ownNet,
  rememberCard,
  saveOwnGame,
  type KnownCard,
  type OwnGame,
  type PlaceKind,
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}
const nightsLabel = (n: number) => `${n} night${n === 1 ? '' : 's'}`

// Where a game was run, and who recorded it, are the two things a player wants
// to tell apart:
//   * Houses / Clubs  -> the two tabs (what kind of place)
//   * On Straddle / Self-reported -> a badge on every row (who recorded it)
export function MyBook() {
  const [cards, setCards] = useState<KnownCard[]>(() => knownCards())
  const [own, setOwn] = useState<OwnGame[]>(() => ownGames())
  const [kind, setKind] = useState<PlaceKind>('house')
  const [editing, setEditing] = useState<OwnGame | 'new' | null>(null)
  const [openPlace, setOpenPlace] = useState<string | null>(null)
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
  const total = hostTotal + ownTotal
  const shown = useCountUp(total)
  const places = useMemo(() => Array.from(new Set(own.map((g) => g.place))), [own])

  const cardsOf = (k: PlaceKind) => cards.filter((c) => c.kind === k)
  const ownByPlace = (k: PlaceKind) => {
    const map = new Map<string, OwnGame[]>()
    for (const g of own.filter((x) => x.kind === k)) map.set(g.place, [...(map.get(g.place) ?? []), g])
    return Array.from(map.entries())
  }
  const countOf = (k: PlaceKind) => cardsOf(k).length + ownByPlace(k).length

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10 sm:p-6">
      <h1 className="text-3xl font-bold text-ink">My book</h1>
      <p className="mt-1 text-xs text-muted">Kept on this phone only.</p>

      <div className="mt-5 rounded-xl border border-hairline bg-canvas p-5">
        <span className="type-label-caption text-muted">Overall</span>
        <p className={cn('type-figure-hero mt-2', tone(total))}>{signed(shown)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
          <div>
            <p className="flex items-center gap-1 text-xs text-muted">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" /> On Straddle
            </p>
            <p className={cn('type-figure-md mt-1', tone(hostTotal))}>{signed(hostTotal)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-muted">
              <Pencil className="h-3.5 w-3.5" /> Self-reported
            </p>
            <p className={cn('type-figure-md mt-1', tone(ownTotal))}>{signed(ownTotal)}</p>
          </div>
        </div>
      </div>

      <Tabs value={kind} onValueChange={(v) => setKind(v as PlaceKind)} className="mt-6">
        <SubTabsList>
          <SubTabsTrigger value="house">
            <Home className="mr-1.5 h-4 w-4" /> Houses · {countOf('house')}
          </SubTabsTrigger>
          <SubTabsTrigger value="club">
            <Building2 className="mr-1.5 h-4 w-4" /> Clubs · {countOf('club')}
          </SubTabsTrigger>
        </SubTabsList>

        {(['house', 'club'] as PlaceKind[]).map((k) => (
          <TabsContent key={k} value={k} className="mt-4">
            {countOf(k) === 0 && (
              <p className="rounded-xl border border-hairline bg-canvas p-5 text-center text-sm text-muted">
                {k === 'house'
                  ? 'No house games yet. Open a card link from a host, or add a game you played.'
                  : 'No clubs yet. Open a card link from a club, or add a game you played.'}
              </p>
            )}

            {countOf(k) > 0 && (
              <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
                {cardsOf(k).map((c) => {
                  const t = cardTotal(c.token)
                  const n = loadBook(c.token).card?.nights.length ?? 0
                  return (
                    <Link
                      key={c.token}
                      to={`/c/${c.token}`}
                      className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{c.group ?? 'Game night'}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-strong px-2 py-0.5 font-semibold text-ink">
                            <BadgeCheck className="h-3 w-3 text-primary" /> On Straddle
                          </span>
                          {nightsLabel(n)}
                        </span>
                      </span>
                      <span className={cn('type-figure-md', tone(t))}>{signed(t)}</span>
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </Link>
                  )
                })}

                {ownByPlace(k).map(([place, games]) => {
                  const t = games.reduce((s, g) => s + ownNet(g), 0)
                  const open = openPlace === `${k}:${place}`
                  return (
                    <div key={place} className="border-b border-hairline last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setOpenPlace(open ? null : `${k}:${place}`)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink">{place}</span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2 py-0.5 font-semibold text-muted">
                              <Pencil className="h-3 w-3" /> Self-reported
                            </span>
                            {nightsLabel(games.length)}
                          </span>
                        </span>
                        <span className={cn('type-figure-md', tone(t))}>{signed(t)}</span>
                        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
                      </button>
                      {open && (
                        <div className="bg-surface-soft px-4 pb-2">
                          {games.map((g) => {
                            const net = ownNet(g)
                            return (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => setEditing(g)}
                                className="flex w-full items-center justify-between gap-3 border-t border-hairline py-2.5 text-left first:border-t-0"
                              >
                                <span className="text-sm text-body">
                                  {formatDate(g.date)} · {g.entries} entr{g.entries === 1 ? 'y' : 'ies'}
                                </span>
                                <span className={cn('text-sm font-bold', tone(net))}>{signed(net)}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <Button variant="secondary" block className="mt-3" onClick={() => setEditing('new')}>
              <Plus className="mr-2 h-4 w-4" /> Add a game I played
            </Button>
            <p className="mt-2 text-center text-xs text-muted">
              For {k === 'house' ? 'home games' : 'clubs'} that do not use Straddle. Only you see it.
            </p>
          </TabsContent>
        ))}
      </Tabs>

      <OwnGameSheet
        game={editing}
        defaultKind={kind}
        places={places}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setOwn(ownGames())
          setEditing(null)
        }}
      />
    </div>
  )
}

function OwnGameSheet({
  game,
  defaultKind,
  places,
  onClose,
  onSaved,
}: {
  game: OwnGame | 'new' | null
  defaultKind: PlaceKind
  places: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [kind, setKind] = useState<PlaceKind>('house')
  const [place, setPlace] = useState('')
  const [date, setDate] = useState(today())
  const [entries, setEntries] = useState('')
  const [finished, setFinished] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (game === null) return
    if (game === 'new') {
      setKind(defaultKind)
      setPlace('')
      setDate(today())
      setEntries('')
      setFinished('')
    } else {
      setKind(game.kind)
      setPlace(game.place)
      setDate(game.date)
      setEntries(String(game.entries))
      setFinished(String(game.finished))
    }
    setError(null)
  }, [game, defaultKind])

  const e = Number(entries)
  const f = Number(finished)
  const preview = entries !== '' && finished !== '' ? Math.round(f - e * chipMultiplier('1:1')) : null

  function save() {
    if (!place.trim()) return setError(kind === 'club' ? 'Which club?' : 'Whose place?')
    if (!(e >= 0) || entries === '') return setError('How many entries?')
    if (!(f >= 0) || finished === '') return setError('What did you finish with? Type 0 if nothing.')
    saveOwnGame({
      id: game && game !== 'new' ? game.id : newId(),
      place: place.trim().slice(0, 60),
      kind,
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
          <SheetTitle>{game === 'new' ? 'Add a game I played' : 'Edit this game'}</SheetTitle>
        </SheetHeader>
        <p className="mt-1 text-xs text-muted">Only on this phone. No host sees it.</p>

        <div className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 rounded-full bg-surface-strong p-1">
            {(['house', 'club'] as PlaceKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold',
                  kind === k ? 'bg-canvas text-ink shadow-sm' : 'text-muted'
                )}
              >
                {k === 'house' ? <Home className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                {k === 'house' ? 'Home game' : 'Club'}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="own-place">{kind === 'club' ? 'Club name' : "Whose place"}</Label>
            <Input
              id="own-place"
              list="own-places"
              className="h-12"
              placeholder={kind === 'club' ? 'Royal Club' : "Kumar's house"}
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
