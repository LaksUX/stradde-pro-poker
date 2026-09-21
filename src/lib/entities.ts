import { supabase } from './supabase'
import type { Profile } from '../hooks/useAuth'

export type HostingEntity = { id: string; name: string; slug: string }

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'host'
}

// Find-or-create a host's own hosting entity — same lazy pattern as
// CreateGame's venue resolution: don't ask the host to set anything up
// explicitly, just provision it invisibly the first time it's needed. See
// REQUIREMENTS.md's thirteenth revision note.
export async function getOrCreateOwnEntity(profile: Profile): Promise<HostingEntity> {
  const { data: existing } = await supabase
    .from('hosting_entities')
    .select('id, name, slug')
    .eq('owner_profile_id', profile.id)
    .maybeSingle()
  if (existing) return existing as HostingEntity

  const name = `${profile.full_name ?? 'Home'}'s games`
  const baseSlug = slugify(profile.full_name ?? 'host')

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await supabase
      .from('hosting_entities')
      .insert({ type: 'house', name, slug, owner_profile_id: profile.id })
      .select('id, name, slug')
      .single()
    if (!error) return data as HostingEntity
    // Unique violation on slug (someone else already has it) — retry with a
    // different one. Anything else is a real failure; don't loop on it.
    if (error.code !== '23505') throw error
  }
  throw new Error("Couldn't set up your hosting page — try again.")
}
