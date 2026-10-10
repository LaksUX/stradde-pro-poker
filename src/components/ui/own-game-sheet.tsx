import { useEffect, useState } from 'react'
import { Building2, Home } from 'lucide-react'
import { cn } from 'cn'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './sheet'
import { deleteOwnGame, newId, saveOwnGame, type OwnGame, type PlaceKind } from '../../lib/myBook'

function today(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// A game the player records themselves (a place that does not use Straddle):
// where, when, and the final result in value. Only on this phone.
export function OwnGameSheet({
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
  const [finished, setFinished] = useState('')
  const [entries, setEntries] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (game === null) return
    if (game === 'new') {
      setKind(defaultKind)
      setPlace('')
      setDate(today())
      setFinished('')
      setEntries('')
    } else {
      setKind(game.kind)
      setPlace(game.place)
      setDate(game.date)
      setFinished(game.finished != null ? String(game.finished) : '')
      setEntries(game.entries != null ? String(game.entries) : '')
    }
    setError(null)
  }, [game, defaultKind])

  function save() {
    if (!place.trim()) return setError(kind === 'club' ? 'Which club?' : 'Whose place?')
    const f = Number(finished)
    if (finished.trim() === '' || !(f >= 0)) return setError('What did you finish with? Type 0 if nothing.')
    const e = entries.trim() === '' ? undefined : Number(entries)
    if (e != null && !(e >= 0)) return setError('Entries must be a number.')
    saveOwnGame({
      id: game && game !== 'new' ? game.id : newId(),
      place: place.trim().slice(0, 60),
      kind,
      date,
      finished: f,
      ...(e != null ? { entries: e } : {}),
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
            <Label htmlFor="own-place">{kind === 'club' ? 'Club name' : 'Whose place'}</Label>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="own-finished">Amount I finished with</Label>
            <Input
              id="own-finished"
              type="number"
              inputMode="numeric"
              min={0}
              className="h-12"
              value={finished}
              onChange={(ev) => setFinished(ev.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="own-entries">Entries (optional)</Label>
            <Input
              id="own-entries"
              type="number"
              inputMode="numeric"
              min={0}
              className="h-12"
              placeholder="Add to see win or loss"
              value={entries}
              onChange={(ev) => setEntries(ev.target.value)}
            />
            <p className="text-xs text-muted">1 entry = 10,000.</p>
          </div>
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
