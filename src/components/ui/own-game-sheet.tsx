import { useEffect, useState } from 'react'
import { Building2, Home } from 'lucide-react'
import { cn } from 'cn'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './sheet'
import { deleteOwnGame, newId, ownNet, saveOwnGame, type OwnGame, type PlaceKind } from '../../lib/myBook'

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
  const [won, setWon] = useState(true)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (game === null) return
    if (game === 'new') {
      setKind(defaultKind)
      setPlace('')
      setDate(today())
      setWon(true)
      setAmount('')
    } else {
      const net = ownNet(game)
      setKind(game.kind)
      setPlace(game.place)
      setDate(game.date)
      setWon(net >= 0)
      setAmount(String(Math.abs(net)))
    }
    setError(null)
  }, [game, defaultKind])

  function save() {
    if (!place.trim()) return setError(kind === 'club' ? 'Which club?' : 'Whose place?')
    const a = Number(amount)
    if (amount.trim() === '' || !(a >= 0)) return setError('How much did you win or lose? Type 0 if even.')
    saveOwnGame({
      id: game && game !== 'new' ? game.id : newId(),
      place: place.trim().slice(0, 60),
      kind,
      date,
      net: won ? a : -a,
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
            <Label htmlFor="own-amount">Final result</Label>
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-strong p-1">
                {([true, false] as const).map((w) => (
                  <button
                    key={String(w)}
                    type="button"
                    onClick={() => setWon(w)}
                    className={cn(
                      'rounded-full px-3 py-2 text-sm font-semibold',
                      won === w ? (w ? 'bg-win text-white' : 'bg-error text-white') : 'text-muted'
                    )}
                  >
                    {w ? 'Won' : 'Lost'}
                  </button>
                ))}
              </div>
              <Input
                id="own-amount"
                type="number"
                inputMode="numeric"
                min={0}
                className="h-12"
                placeholder="Amount"
                value={amount}
                onChange={(ev) => setAmount(ev.target.value)}
              />
            </div>
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
