import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import type { ChipRatio } from '../lib/chips'

// See PAGE_PROMPTS.md "Create Game". Table size + chip ratio are real,
// always-set fields now (not hidden/off-by-default) — see REQUIREMENTS.md's
// ninth and tenth revisions for why.
export function CreateGame() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('Tuesday night')
  const [venue, setVenue] = useState('')
  const [stake, setStake] = useState(5)
  const [chipRatio, setChipRatio] = useState<ChipRatio>('1:1')
  const [tableSize, setTableSize] = useState(9)
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [scheduledFor, setScheduledFor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!profile) return
    if (!name.trim() || !stake || !tableSize) {
      setError('Name, stake, and table size are all required')
      return
    }
    if (scheduleMode === 'later' && !scheduledFor) {
      setError('Set a date/time to schedule')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const { data, error: insertError } = await supabase
        .from('games')
        .insert({
          host_id: profile.id,
          name: name.trim(),
          venue_freetext: venue.trim() || null,
          stake,
          chip_ratio: chipRatio,
          table_size: tableSize,
          status: scheduleMode === 'now' ? 'live' : 'scheduled',
          scheduled_for: scheduleMode === 'later' ? scheduledFor : new Date().toISOString(),
        })
        .select('id, status')
        .single()
      if (insertError) throw insertError

      navigate(data.status === 'live' ? `/t/${data.id}` : `/games/${data.id}/scheduled`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-lg font-semibold text-ink">New game</h1>

      <label className="block text-sm font-medium text-muted">Game name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-14 w-full rounded-sm border border-hairline px-3 text-ink"
      />
      <label className="mt-3 block text-sm font-medium text-muted">Venue</label>
      <input
        value={venue}
        onChange={(e) => setVenue(e.target.value)}
        placeholder="Kumar's house"
        className="h-14 w-full rounded-sm border border-hairline px-3 text-ink"
      />
      <label className="mt-3 block text-sm font-medium text-muted">
        Buy-in amount (stake, banks)
      </label>
      <input
        type="number"
        value={stake}
        onChange={(e) => setStake(Number(e.target.value) || 0)}
        className="h-14 w-full rounded-sm border border-hairline px-3 text-ink"
      />
      <label className="mt-3 block text-sm font-medium text-muted">Table size</label>
      <input
        type="number"
        value={tableSize}
        onChange={(e) => setTableSize(Number(e.target.value) || 9)}
        className="h-14 w-full rounded-sm border border-hairline px-3 text-ink"
      />
      <p className="mt-1 text-xs text-muted">Usual is 9 — stays editable all night.</p>

      <label className="mt-3 block text-sm font-medium text-muted">Chip ratio</label>
      <div className="flex gap-1.5">
        {(['1:1', '1:2'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setChipRatio(r)}
            className={`flex-1 rounded-sm border py-2 text-sm ${
              chipRatio === r ? 'border-ink bg-ink text-white' : 'border-hairline text-muted'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">
        1 bank = {chipRatio === '1:2' ? '2 chips' : '1 chip'} — locked once the game starts.
      </p>

      <label className="mt-3 block text-sm font-medium text-muted">When</label>
      <div className="flex gap-1.5">
        <button
          onClick={() => setScheduleMode('now')}
          className={`flex-1 rounded-sm border py-2 text-sm ${
            scheduleMode === 'now' ? 'border-ink bg-ink text-white' : 'border-hairline text-muted'
          }`}
        >
          Now
        </button>
        <button
          onClick={() => setScheduleMode('later')}
          className={`flex-1 rounded-sm border py-2 text-sm ${
            scheduleMode === 'later'
              ? 'border-ink bg-ink text-white'
              : 'border-hairline text-muted'
          }`}
        >
          Schedule for later
        </button>
      </div>
      {scheduleMode === 'later' && (
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="mt-2 h-14 w-full rounded-sm border border-hairline px-3 text-ink"
        />
      )}

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      <Button block className="mt-5" disabled={creating} onClick={handleCreate}>
        {scheduleMode === 'now' ? 'Start game & share' : 'Schedule game'}
      </Button>
    </div>
  )
}
