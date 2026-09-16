import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// See REQUIREMENTS.md "Access model" (twelfth revision) — ONE identity
// mechanism for everyone now, not two. Phone number, entered by the person
// themself, no password, no email, no OTP. Hosting is not a different sign-in
// method — it's a `role` / `approved` pair on the same kind of profile
// everyone gets, reached by an explicit "Apply to host" action (see
// applyToHost below), not inferred from how someone signed in.

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
 * The one entry mechanism for everyone — see pages/Continue.tsx (no game
 * context) and pages/Join.tsx (in the context of a specific game link). Both
 * call this same function.
 *
 * IMPORTANT — read before building on this: Supabase Anonymous Sign-in mints
 * a brand-new `auth.uid()` per device. A plain client-side upsert keyed on
 * that id, as a first draft of this function did, CANNOT satisfy "same phone
 * matches across devices" — it would either violate the `profiles.phone`
 * unique constraint or (if you loosened that constraint) silently create a
 * second, disconnected identity per device, quietly breaking the
 * cross-device history promise in REQUIREMENTS.md.
 *
 * The correct fix needs a server-side Supabase Edge Function running with
 * the service-role key — never exposed to the client — that:
 *   1. Looks up `profiles` by phone.
 *   2. If found, mints a session for that EXISTING user id (via the Admin
 *      API), rather than creating a new anonymous user.
 *   3. If not found, creates a new anonymous user + profile as below.
 * That function is stubbed at supabase/functions/join-as-player/ with this
 * same explanation — implement it before relying on cross-device rejoin.
 * Until then, this client-side path only correctly handles the first-time,
 * new-phone case, and will throw rather than silently mis-link an existing
 * phone to a new device's session.
 *
 * New profiles default to `role: 'player'` — hosting is never inferred here,
 * only granted via applyToHost, below.
 */
export async function continueWithPhone(name: string, phoneE164: string): Promise<Profile> {
  // The phone lookup this function used to do BEFORE signing in was
  // silently broken: profiles' RLS only allows reading a row where
  // id = auth.uid(), so an unauthenticated client can never find someone
  // else's row by phone number, regardless of whether it exists. That
  // pre-check always returned nothing, making it theater — the database's
  // own unique constraint on profiles.phone is the only thing that was
  // ever actually enforcing "one profile per phone," and it was throwing a
  // raw Postgrest error the UI never caught cleanly, showing a useless
  // generic message instead of a real explanation.
  let user: User | null = (await supabase.auth.getSession()).data.session?.user ?? null
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    user = data.user
  }
  if (!user) throw new Error('Anonymous sign-in did not return a user')

  const { data: created, error: upsertError } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, full_name: name, phone: phoneE164, role: 'player', approved: false },
      { onConflict: 'id' }
    )
    .select('id, full_name, phone, role, approved')
    .single()

  if (upsertError) {
    if (upsertError.code === '23505') {
      // Postgres unique-violation code — this phone already belongs to a
      // DIFFERENT auth identity than the current session. This is exactly
      // the cross-device/cross-session case that needs the Edge Function
      // described above — not implemented yet, so this fails loudly with a
      // real explanation instead of a silent or generic crash.
      throw new Error(
        "This phone is already linked to a different device or browser session. " +
          "Rejoining the same account from a new device/session isn't supported yet " +
          '— see the comment on this function for what the real fix looks like.'
      )
    }
    throw new Error(upsertError.message || 'Could not sign in — please try again.')
  }

  return created as Profile
}

/**
 * The explicit action that requests the host role — see pages/ApplyToHost.tsx.
 * Sets role/approved on the CURRENT session's own profile; relies on the
 * existing "update own profile" RLS policy (id = auth.uid()), which is
 * intentionally unrestricted on which columns a self-update can touch. Worth
 * tightening to a specific allowed-column set before this leaves prototype
 * status — flagged here rather than assumed safe.
 */
export async function applyToHost(): Promise<Profile> {
  const user = (await supabase.auth.getSession()).data.session?.user
  if (!user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('profiles')
    .update({ role: 'host', approved: false })
    .eq('id', user.id)
    .select('id, full_name, phone, role, approved')
    .single()
  if (error) throw error
  return data as Profile
}
