import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageSpinner } from '../components/ui/Spinner'

type Entity = { id: string; name: string }

// A hosting entity's permanent link — see REQUIREMENTS.md's thirteenth
// revision note. Unlike a game's one-off /t/:gameId link (reminted every
// night), this one never changes: print it once, always resolves to
// whichever game is live or scheduled for this entity right now. Public,
// unauthenticated, outside AppShell — same tier as ShareTable/Join.
export function EntityLink() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [entity, setEntity] = useState<Entity | 'not-found' | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    supabase
      .from('public_hosting_entity_summary')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setEntity(data ?? 'not-found')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!entity || entity === 'not-found') return
    let cancelled = false

    async function loadActiveGame() {
      const { data } = await supabase
        .from('public_game_summary')
        .select('id, status')
        .eq('hosting_entity_id', (entity as Entity).id)
        .in('status', ['live', 'scheduled'])
        .order('scheduled_for', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled || !data) return
      navigate(data.status === 'live' ? `/t/${data.id}` : `/games/${data.id}/scheduled`, {
        replace: true,
      })
    }
    loadActiveGame()

    // No active game yet when this page first loads is a real, expected
    // state (a walk-up scanning a wall QR before the host has started
    // tonight's game) — this keeps checking so it self-resolves the moment
    // one goes live, instead of needing a manual reload.
    const channel = supabase
      .channel(`entity-link-${(entity as Entity).id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `hosting_entity_id=eq.${(entity as Entity).id}` },
        loadActiveGame
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [entity, navigate])

  if (entity === null) return <PageSpinner />
  if (entity === 'not-found') {
    return <div className="p-6 text-center text-muted">This link isn't valid.</div>
  }

  return (
    <div className="mx-auto max-w-sm p-6 text-center">
      <h1 className="type-page-title text-ink">{entity.name}</h1>
      <p className="mt-3 text-sm text-muted">
        No game live right now — this page updates on its own the moment one starts.
      </p>
    </div>
  )
}
