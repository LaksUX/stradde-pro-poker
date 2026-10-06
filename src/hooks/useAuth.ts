import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// See REQUIREMENTS.md "Access model" (twelfth revision) — ONE identity
// mechanism for everyone now, not two. Phone number, entered by the person
// themself, no password, no email, no OTP. Hosting is not a different sign-in
// method — it's a `role` / `approved` pair on the same kind of profile
// everyone gets, granted only by an admin (see Admin.tsx's makeHost), never
// inferred from how someone signed in and never self-serve.

export type Profile = {
  id: string
  full_name: string | null
  phone: string | null
  role: 'player' | 'host' | 'admin'
  approved: boolean
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setSessionLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (sessionLoading) return
    if (!session?.user) {
      setProfile(null)
      setProfileLoading(false)
      return
    }
    let cancelled = false
    setProfileLoading(true)
    supabase
      .from('profiles')
      .select('id, full_name, phone, role, approved')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        // No auto-creation branch here anymore. Every profile now comes from
        // an explicit continueWithPhone call (Continue or Join) before this
        // effect ever sees the session — a session with no matching row is
        // a real gap to investigate, not something to paper over by guessing
        // a role.
        if (!cancelled) {
          setProfile(data as Profile | null)
          setProfileLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionLoading, session?.user?.id])

  return { session, user: session?.user ?? null, profile, loading: sessionLoading || profileLoading }
}

/**
 * Name-only entry for someone opening an old join link: signs in anonymously
 * (no phone, no email, no password) and creates a profile with just a name.
 * If this browser already has a profile, it is reused as is.
 */
export async function continueWithName(name: string): Promise<Profile> {
  let user: User | null = (await supabase.auth.getSession()).data.session?.user ?? null
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    user = data.user
  }
  if (!user) throw new Error('Could not start a session')

  const { data: existing } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, approved')
    .eq('id', user.id)
    .maybeSingle()
  if (existing) return existing as Profile

  const { data: created, error } = await supabase
    .rpc('upsert_own_profile', { p_full_name: name, p_phone: null })
    .select('id, full_name, phone, role, approved')
    .single()
  if (error) throw new Error(error.message || 'Could not continue, please try again.')
  return created as Profile
}
