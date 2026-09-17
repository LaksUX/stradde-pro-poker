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
 * Cross-device/cross-session rejoin: when the phone belongs to a different
 * auth identity than the current session, this now calls the
 * join-as-player Edge Function (supabase/functions/join-as-player/) to mint
 * a real session for the EXISTING profile via a synthetic-email magic-link
 * token — see that file for the full explanation. UNTESTED end to end: I
 * have no network access to supabase.co from where this was built, so I
 * could type-check and build the client side but never actually invoke the
 * function against a live project. Deploy it and test the exact scenario
 * (sign in with a phone that already has a profile, from a fresh
 * session/incognito window) before trusting this works.
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
      // This phone already belongs to a different auth identity than the
      // current session. Try the Edge Function's session-minting path —
      // see supabase/functions/join-as-player/index.ts. UNTESTED end to
      // end (no network access to supabase.co from where this was built —
      // see that file's header for exact test steps). If this also fails,
      // fall through to a clear error rather than a silent/generic one.
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/join-as-player`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ phone: phoneE164 }),
          }
        )
        const json = await res.json()
        if (!res.ok || json.error) {
          throw new Error(json.error || `join-as-player returned ${res.status}`)
        }
        if (!json.exists || !json.hashed_token) {
          throw new Error('join-as-player did not return a usable session token')
        }
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: json.hashed_token,
          type: 'magiclink',
        })
        if (verifyError) throw verifyError

        const { data: reloaded, error: reloadError } = await supabase
          .from('profiles')
          .select('id, full_name, phone, role, approved')
          .eq('phone', phoneE164)
          .single()
        if (reloadError) throw reloadError
        return reloaded as Profile
      } catch (edgeFnError) {
        // A raw "Failed to fetch" here almost always means the
        // join-as-player Edge Function (supabase/functions/join-as-player/)
        // hasn't been deployed to this project yet — `supabase functions
        // deploy join-as-player` needs a Supabase access token, which isn't
        // something the running app can do for itself. Surface that plainly
        // instead of leaking the fetch error, so it reads as a known,
        // fixable gap rather than a mystery failure.
        console.error('join-as-player Edge Function call failed:', edgeFnError)
        throw new Error(
          "This phone is already signed in on another device or browser. Cross-device " +
            "sign-in isn't set up on this deployment yet — sign in from the original " +
            'device, or ask whoever manages this app to deploy the join-as-player function.'
        )
      }
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
