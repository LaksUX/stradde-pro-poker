import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover'
import { Calendar } from '../components/ui/calendar'
import { TimePicker } from '../components/ui/time-picker'
import { getOrCreateOwnEntity } from '../lib/entities'
import { chipMultiplier, type ChipRatio } from '../lib/chips'

// Buy-ins are always exactly 1 bank each now — see REQUIREMENTS.md's
// Fifteenth revision note. `stake` stays a real, working column (settlement
// math is unchanged), it's just never asked for on this form anymore.
const FIXED_STAKE = 1

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
  const [rake, setRake] = useState(0)
  const [chipRatio, setChipRatio] = useState<ChipRatio>('1:1')
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined)
  const [scheduledTime, setScheduledTime] = useState('19:00')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // Only autofill a field the host hasn't touched themselves — picking a
  // date shouldn't clobber a name/venue they already typed.
  const [nameTouched, setNameTouched] = useState(false)
  const [venueTouched, setVenueTouched] = useState(false)
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

  // Picking a date is a signal worth using: hosts tend to repeat the same
  // night/venue week over week, so look at this host's own history for the
  // same day of week and suggest whatever comes up most. Venue is meant to
  // always be auto-populated (rarely hand-typed) — so if nothing matches
  // this exact day of week (a host's first game, or an off-day one-off),
  // fall back to this host's single most-used venue overall rather than
  // leaving the field empty.
  async function autofillFromDate(date: Date) {
    const weekdayName = date.toLocaleDateString('en-US', { weekday: 'long' })
    if (!nameTouched) setName(`${weekdayName} night`)
    if (venueTouched || !profile) return

    const { data } = await supabase
      .from('games')
      .select('venue_freetext, scheduled_for')
      .eq('host_id', profile.id)
      .not('venue_freetext', 'is', null)
    const targetDow = date.getDay()
    const sameDayCounts = new Map<string, number>()
    const overallCounts = new Map<string, number>()
    for (const g of data ?? []) {
      if (!g.venue_freetext || !g.scheduled_for) continue
      overallCounts.set(g.venue_freetext, (overallCounts.get(g.venue_freetext) ?? 0) + 1)
      if (new Date(g.scheduled_for).getDay() !== targetDow) continue
      sameDayCounts.set(g.venue_freetext, (sameDayCounts.get(g.venue_freetext) ?? 0) + 1)
    }
    const mostFrequent = (counts: Map<string, number>) => {
      let best: string | null = null
      let bestCount = 0
      for (const [v, c] of counts) {
        if (c > bestCount) {
          best = v
          bestCount = c
        }
      }
      return best
    }
    const best = mostFrequent(sameDayCounts) ?? mostFrequent(overallCounts)
    if (best) setVenue(best)
  }

  // Venue is "always auto populated," per the host — not just when
  // scheduling for a future date. Run the same autofill against today's
  // date once the profile loads, for the "start now" path too.
  useEffect(() => {
    if (profile) autofillFromDate(new Date())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  if (loading) return <PageSpinner />
  if (!profile?.approved) {
    return (
      <div className="mx-auto w-full max-w-sm p-4 sm:p-6 text-center">
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
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (scheduleMode === 'later' && !scheduledDate) {
      setError('Pick a date to schedule')
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

      const scheduledForIso = (() => {
        if (scheduleMode !== 'later' || !scheduledDate) return new Date().toISOString()
        const [hours, minutes] = scheduledTime.split(':').map(Number)
        const combined = new Date(scheduledDate)
        combined.setHours(hours || 0, minutes || 0, 0, 0)
        return combined.toISOString()
      })()

      const { data, error: insertError } = await supabase
        .from('games')
        .insert({
          host_id: profile.id,
          hosting_entity_id: entity.id,
          name: name.trim(),
          venue_id: venueId,
          venue_freetext: trimmedVenue || null,
          stake: FIXED_STAKE,
          rake,
          chip_ratio: chipRatio,
          status: scheduleMode === 'now' ? 'live' : 'scheduled',
          scheduled_for: scheduledForIso,
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
            : ((e as { message?: string })?.message ?? 'Something went wrong')
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
      <h1 className="type-page-title mb-4 text-ink">New game</h1>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-name">Game name</Label>
        <Input
          id="game-name"
          className="h-14"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setNameTouched(true)
          }}
        />
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <Label htmlFor="game-venue">Venue</Label>
        <div className="relative">
          <Input
            id="game-venue"
            className="h-14"
            value={venue}
            onChange={(e) => {
              setVenue(e.target.value)
              setVenueTouched(true)
            }}
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
                    setVenueTouched(true)
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
        <Label htmlFor="game-rake">Rake (one-time house fee, banks)</Label>
        <Input
          id="game-rake"
          type="number"
          className="h-14"
          value={rake}
          onChange={(e) => setRake(Number(e.target.value) || 0)}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        Set once here — still editable later from Live Game if you need to adjust it.
      </p>

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
        1 bank = {chipMultiplier(chipRatio).toLocaleString()} chip — locked once the game starts.
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
        <div className="mt-2 flex gap-2">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger className="h-14 flex-1 rounded-sm border border-hairline bg-surface-strong px-3 text-left text-sm text-ink">
              {scheduledDate
                ? scheduledDate.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                : 'Pick a date'}
            </PopoverTrigger>
            <PopoverContent>
              <Calendar
                mode="single"
                selected={scheduledDate}
                disabled={{ before: new Date() }}
                onSelect={(date) => {
                  setScheduledDate(date)
                  setCalendarOpen(false)
                  if (date) autofillFromDate(date)
                }}
              />
            </PopoverContent>
          </Popover>
          <TimePicker className="w-32" value={scheduledTime} onChange={setScheduledTime} />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      <Button block className="mt-5" disabled={creating} onClick={handleCreate}>
        {scheduleMode === 'now' ? 'Start game & share' : 'Schedule game'}
      </Button>
    </div>
  )
}
