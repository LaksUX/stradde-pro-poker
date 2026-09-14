import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// See REQUIREMENTS.md "Access model" — two identity tracks on purpose.
// Host: real Supabase Auth (email magic-link), admin-approved.
// Player: Supabase Anonymous Sign-in, keyed by phone (E.164) — no email, no
// password, no OTP. Both produce a Supabase `User`/`auth.uid()`, so RLS
// doesn't need to know which track a given session came from; only the
// `profiles.role` / `profiles.phone` columns do.

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

/** Host track: send a magic link. See pages/Login.tsx. */
export async function sendHostMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

/**
 * Player track: get-or-create an anonymous session, then link it to a
 * profile keyed by phone. See REQUIREMENTS.md "Joining a game": "no
 * verification code — a typed phone number is not proven to belong to the
 * person typing it. That's an accepted trade-off, not an oversight," and
 * "Rejoining from a new device: typing the same phone number again matches
 * the existing identity... without any separate claim step."
 *
 * IMPORTANT — read before building on this: Supabase Anonymous Sign-in
 * mints a brand-new `auth.uid()` per device. A plain client-side upsert
 * keyed on that id, as a first draft of this function did, CANNOT satisfy
 * "same phone matches across devices" — it would either violate the
 * `profiles.phone` unique constraint or (if you loosened that constraint)
 * silently create a second, disconnected identity per device, quietly
 * breaking the cross-device history promise in REQUIREMENTS.md.
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
 */
export async function joinAsPlayer(name: string, phoneE164: string): Promise<string> {
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', phoneE164)
    .maybeSingle()

  const currentUser = (await supabase.auth.getSession()).data.session?.user ?? null

  if (existing && existing.id !== currentUser?.id) {
    // This phone belongs to a different auth identity than the current
    // session — exactly the case that needs the Edge Function above. Fail
    // loudly rather than guessing.
    throw new Error(
      'This phone number is already linked to another device/session. ' +
        'Cross-device rejoin needs the join-as-player Edge Function — see the ' +
        'comment on this function — which is not implemented yet in this scaffold.'
    )
  }

  let user: User | null = currentUser
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    user = data.user
  }
  if (!user) throw new Error('Anonymous sign-in did not return a user')

  const { error: upsertError } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, full_name: name, phone: phoneE164, role: 'player' },
      { onConflict: 'id' }
    )
  if (upsertError) throw upsertError

  return user.id
}
