import { supabase } from './supabase'

// Host invite links (migration 0030). A friend opens /h/:token, starts their
// own group, and the invite is claimed so the inviter sees them in
// "Hosts you invited".

const PENDING_KEY = 'straddle:host-invite'

export type InvitedHost = {
  host_id: string
  name: string
  group: string | null
  joined_at: string
  paused: boolean
  games: number
  players: number
  last_game_at: string | null
}

export function hostInviteUrl(token: string): string {
  return `${window.location.origin}/h/${token}`
}

export function setPendingInvite(token: string) {
  try {
    localStorage.setItem(PENDING_KEY, token)
  } catch {
    // storage blocked: the invite can be re-opened from the link
  }
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // nothing to clear
  }
}

// Claim the invite stored on this phone, if any. Never blocks the caller.
export async function claimPendingInvite(): Promise<void> {
  const token = pendingInvite()
  if (!token) return
  const { error } = await supabase.rpc('claim_host_invite', { p_token: token })
  if (!error) clearPendingInvite()
}

export async function ensureHostInvite(regenerate = false): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_host_invite', { p_regenerate: regenerate })
  if (error) throw new Error(error.message)
  return data as string
}

export async function getHostInvite(token: string): Promise<{ inviter: string } | null> {
  const { data, error } = await supabase.rpc('get_host_invite', { p_token: token })
  if (error) throw new Error(error.message)
  return (data as { inviter: string } | null) ?? null
}

export async function myInvitedHosts(): Promise<InvitedHost[]> {
  const { data, error } = await supabase.rpc('my_invited_hosts')
  if (error) throw new Error(error.message)
  return (data as InvitedHost[]) ?? []
}

export async function setHostPaused(hostId: string, paused: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_invited_host_paused', { p_host_id: hostId, p_paused: paused })
  if (error) throw new Error(error.message)
}
