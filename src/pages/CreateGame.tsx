import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { getOrCreateOwnEntity } from '../lib/entities'
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

  if (loading) return <PageSpinner />
  if (!profile?.approved) {
    return (
      <div className="mx-auto max-w-sm p-6 text-center">
        <h1 className="type-page-title text-ink">Pending approval</h1>
        <p className="type-body-md mt-2 text-body">
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
      const entity = await getOrCreateOwnEntity(profile)

      const { data, error: insertError } = await supabase
        .from('games')
        .insert({
          host_id: profile.id,
          hosting_entity_id: entity.id,
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
      <h1 className="type-page-title mb-4 text-ink">New game</h1>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-name">Game name</Label>
        <Input id="game-name" className="h-14" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <Label htmlFor="game-venue">Venue</Label>
        <div className="relative">
          <Input
            id="game-venue"
            className="h-14"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Kumar's house"
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
                  className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-strong"
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        {selectedVenueId
          ? 'Linked to this venue’s history.'
          : 'Pick a match above, or a new venue is created for this name.'}
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        <Label htmlFor="game-stake">Buy-in amount (stake, banks)</Label>
        <Input
          id="game-stake"
          type="number"
          className="h-14"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value) || 0)}
        />
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <Label>Chip ratio</Label>
        <Tabs value={chipRatio} onValueChange={(v) => setChipRatio(v as ChipRatio)}>
          <TabsList>
            <TabsTrigger value="1:1">1:1</TabsTrigger>
            <TabsTrigger value="1:2">1:2</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <p className="mt-1 text-xs text-muted">
        1 bank = {chipRatio === '1:2' ? '2 chips' : '1 chip'} — locked once the game starts.
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        <Label>When</Label>
        <Tabs value={scheduleMode} onValueChange={(v) => setScheduleMode(v as 'now' | 'later')}>
          <TabsList>
            <TabsTrigger value="now">Now</TabsTrigger>
            <TabsTrigger value="later">Schedule for later</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {scheduleMode === 'later' && (
        <Input
          type="datetime-local"
          className="mt-2 h-14"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
        />
      )}

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      <Button block className="mt-5" disabled={creating} onClick={handleCreate}>
        {scheduleMode === 'now' ? 'Start game & share' : 'Schedule game'}
      </Button>
    </div>
  )
}
