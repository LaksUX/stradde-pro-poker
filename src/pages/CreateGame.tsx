import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import type { ChipRatio } from '../lib/chips'

type VenueOption = { id: string; name: string }

// See PAGE_PROMPTS.md "Create Game". Table size + chip ratio are real,
// always-set fields now (not hidden/off-by-default) — see REQUIREMENTS.md's
// ninth and tenth revisions for why.
export function CreateGame() {
  const { profile, loading } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('Tuesday night')
  const [venue, setVenue] = useState('')
  const [venueSuggestions, setVenueSuggestions] = useState<VenueOption[]>([])
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)
  const [stake, setStake] = useState(5)
  const [chipRatio, setChipRatio] = useState<ChipRatio>('1:1')
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [scheduledFor, setScheduledFor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // Set right before setVenue() inside the suggestion's own onClick, so the
  // effect below — which otherwise clears selectedVenueId on every keystroke
  // — knows this particular venue change WAS the selection, not the user
  // typing over one, and leaves it alone for that one render.
  const justSelectedVenue = useRef(false)

  // Typeahead against existing venues — REQUIREMENTS.md's stated mitigation
  // for the venue dedup gap ("Kumar's house" vs "Kumar's Place" creating two
  // separate venues): search before allowing a new one, don't fuzzy-match
  // after the fact. Clearing selectedVenueId on every keystroke means typing
  // over a picked suggestion falls back to find-or-create on submit, same as
  // if the venue field had never been touched by a picker at all.
  useEffect(() => {
    if (justSelectedVenue.current) {
      justSelectedVenue.current = false
      return
    }
    setSelectedVenueId(null)
    const query = venue.trim()
    if (query.length < 2) {
      setVenueSuggestions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('venues')
        .select('id, name')
        .ilike('name', `%${query}%`)
        .limit(5)
      if (!cancelled) setVenueSuggestions((data ?? []) as VenueOption[])
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [venue])

  async function resolveVenueId(name: string): Promise<string> {
    const { data: existing } = await supabase
      .from('venues')
      .select('id')
      .ilike('name', name)
      .maybeSingle()
    if (existing) return existing.id

    const { data: created, error } = await supabase
      .from('venues')
      .insert({ name, created_by: profile!.id })
      .select('id')
      .single()
    if (error) {
      // Lost a race with another host typing the same name — the unique
      // lower(name) index (0001_core_schema.sql) rejected the insert.
      // Fetch the row that won instead of failing the whole game creation.
      const { data: winner } = await supabase
        .from('venues')
        .select('id')
        .ilike('name', name)
        .maybeSingle()
      if (winner) return winner.id
      throw error
    }
    return created.id
  }

  if (loading) return <div className="p-6 text-center text-muted">Loading…</div>
  if (!profile?.approved) {
    return (
      <div className="mx-auto max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Pending approval</h1>
        <p className="mt-2 text-muted">
          Your account exists but isn't approved as a host yet. See the project README for the
          one-line SQL to approve yourself until the Admin screen is built.
        </p>
      </div>
    )
  }

  async function handleCreate() {
    if (!profile) return
    if (!name.trim() || !stake) {
      setError('Name and stake are both required')
      return
    }
    if (scheduleMode === 'later' && !scheduledFor) {
      setError('Set a date/time to schedule')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const trimmedVenue = venue.trim()
      const venueId = trimmedVenue
        ? selectedVenueId ?? (await resolveVenueId(trimmedVenue))
        : null

      const { data, error: insertError } = await supabase
        .from('games')
        .insert({
          host_id: profile.id,
          name: name.trim(),
          venue_id: venueId,
          venue_freetext: trimmedVenue || null,
          stake,
          chip_ratio: chipRatio,
          status: scheduleMode === 'now' ? 'live' : 'scheduled',
          scheduled_for: scheduleMode === 'later' ? scheduledFor : new Date().toISOString(),
        })
        .select('id, status')
        .single()
      if (insertError) throw insertError

      // A host is also a player in their own game (REQUIREMENTS.md "Roles
      // inside a game") — this row is what lets Share Table recognize the
      // host as already-joined, instead of offering them "Join this game"
      // on their own link, and is what their own buy-ins/cash-out attach to.
      const { error: hostPlayerError } = await supabase
        .from('game_players')
        .insert({ game_id: data.id, profile_id: profile.id, is_host: true })
      if (hostPlayerError) throw hostPlayerError

      navigate(data.status === 'live' ? `/t/${data.id}` : `/games/${data.id}/scheduled`)
    } catch (e) {
      setError(
        !navigator.onLine
          ? "You're offline — reconnect and try again."
          : e instanceof Error
            ? e.message
            : 'Something went wrong'
      )
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
      <div className="relative">
        <input
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          placeholder="Kumar's house"
          className="h-14 w-full rounded-sm border border-hairline px-3 text-ink"
        />
        {venueSuggestions.length > 0 && !selectedVenueId && (
          <div className="absolute z-10 mt-1 w-full rounded-sm border border-hairline bg-canvas shadow-elevated">
            {venueSuggestions.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  justSelectedVenue.current = true
                  setVenue(v.name)
                  setSelectedVenueId(v.id)
                  setVenueSuggestions([])
                }}
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-soft"
              >
                {v.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        {selectedVenueId
          ? 'Linked to this venue’s history.'
          : 'Pick a match above, or a new venue is created for this name.'}
      </p>
      <label className="mt-3 block text-sm font-medium text-muted">
        Buy-in amount (stake, banks)
      </label>
      <input
        type="number"
        value={stake}
        onChange={(e) => setStake(Number(e.target.value) || 0)}
        className="h-14 w-full rounded-sm border border-hairline px-3 text-ink"
      />
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
