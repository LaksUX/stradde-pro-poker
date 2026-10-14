import { useEffect, useState } from 'react'
import { cn } from 'cn'
import { sendRsvp, type CardUpcoming, type Rsvp } from '../../lib/playerCard'
import { toast } from '../../lib/toast'
import { Button } from './button'
import { Input } from './input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './sheet'
import { TimePicker } from './time-picker'

const CHOICES: { value: Exclude<Rsvp, 'pending'>; label: string }[] = [
  { value: 'in', label: "I'm in" },
  { value: 'maybe', label: 'Maybe' },
  { value: 'out', label: "Can't make it" },
]

function TimeField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value: string | null
  fallback: string
  onChange: (v: string | null) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink">{label}</span>
      {value ? (
        <span className="flex items-center gap-2">
          <TimePicker className="w-32" value={value} onChange={onChange} />
          <button type="button" className="text-xs font-semibold text-muted" onClick={() => onChange(null)}>
            Clear
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="cta-soft rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
          onClick={() => onChange(fallback)}
        >
          Add time
        </button>
      )}
    </div>
  )
}

// A player's answer for one upcoming game: In / Maybe / Out, plus optional
// arrival and leaving times and a note. Only the host reads the times and note.
export function RsvpSheet({
  token,
  game,
  onClose,
  onSaved,
}: {
  token: string
  game: CardUpcoming | null
  onClose: () => void
  onSaved: () => void
}) {
  const [response, setResponse] = useState<Exclude<Rsvp, 'pending'>>('in')
  const [arrive, setArrive] = useState<string | null>(null)
  const [leaveBy, setLeaveBy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!game) return
    setResponse(game.response === 'pending' ? 'in' : game.response)
    setArrive(game.arrive)
    setLeaveBy(game.leave_by)
    setNote(game.note ?? '')
  }, [game])

  async function save() {
    if (!game) return
    setSaving(true)
    try {
      const times = response !== 'out'
      await sendRsvp(token, game.game_id, response, times ? arrive : null, times ? leaveBy : null, note.trim() || null)
      toast.success('Sent to the host')
      onSaved()
      onClose()
    } catch {
      toast.error("Couldn't save. Check the connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={!!game} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{game?.name ?? 'Game'}</SheetTitle>
        </SheetHeader>
        {game && (
          <p className="mt-1 text-sm text-muted">
            {new Date(game.at).toLocaleString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
            {game.place ? ` · ${game.place}` : ''}
          </p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2">
          {CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setResponse(c.value)}
              className={cn(
                'rounded-lg border px-2 py-3 text-sm font-semibold',
                response === c.value
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-hairline bg-canvas text-ink'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {response !== 'out' && (
          <div className="mt-5 space-y-3">
            <TimeField label="Arriving about" value={arrive} fallback="20:00" onChange={setArrive} />
            <TimeField label="Leaving by" value={leaveBy} fallback="01:00" onChange={setLeaveBy} />
          </div>
        )}

        <Input
          className="mt-5 h-12"
          placeholder="Note for the host (optional)"
          maxLength={280}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="mt-2 text-xs text-muted">Only the host sees this.</p>

        <Button block className="mt-5" disabled={saving} onClick={save}>
          {saving ? 'Sending…' : 'Send'}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
