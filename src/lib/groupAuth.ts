import { supabase } from './supabase'
import type { Profile } from '../hooks/useAuth'

// MVP 2.0 host accounts: an anonymous Supabase session is the account, and a
// group ID + 4-digit PIN (checked server-side, see migration 0023 and the
// group-login Edge Function) gets the host back in on a new phone.

export async function startGroup(name: string, groupName: string, pin: string): Promise<string> {
  let user = (await supabase.auth.getSession()).data.session?.user ?? null
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    user = data.user
  }
  if (!user) throw new Error('Could not start a session')

  const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
  if (!existing) {
    const { error } = await supabase.rpc('upsert_own_profile', { p_full_name: name, p_phone: null })
    if (error) throw new Error(error.message)
  }

  const { data, error } = await supabase.rpc('start_hosting', { p_group_name: groupName, p_pin: pin })
  if (error) throw new Error(error.message)
  return data as string
}

// For a host who is already signed in (an existing account): add a PIN and
// get a group ID without signing out or creating anything new.
export async function createGroupForCurrentHost(groupName: string, pin: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_hosting', { p_group_name: groupName, p_pin: pin })
  if (error) throw new Error(error.message)
  return data as string
}

export async function signInWithGroup(groupId: string, pin: string): Promise<void> {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/group-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ group_id: groupId, pin }),
  })
  const text = await res.text().catch(() => '')
  let json: { error?: string; message?: string; msg?: string; hashed_token?: string } = {}
  try {
    json = JSON.parse(text)
  } catch {
    // not JSON — fall back to the raw text below
  }
  if (!res.ok || json.error || !json.hashed_token) {
    const detail = json.error || json.message || json.msg || text.slice(0, 200)
    throw new Error(`Sign-in failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  const { error } = await supabase.auth.verifyOtp({ token_hash: json.hashed_token, type: 'magiclink' })
  if (error) throw error
}

export async function getMyGroup(): Promise<{ group_id: string; name: string | null } | null> {
  const { data, error } = await supabase.rpc('get_my_group')
  if (error) throw error
  return (data as { group_id: string; name: string | null } | null) ?? null
}

export async function changeGroupPin(pin: string): Promise<void> {
  const { error } = await supabase.rpc('change_group_pin', { p_pin: pin })
  if (error) throw new Error(error.message)
}

export type { Profile }
