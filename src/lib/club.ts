import { supabase } from './supabase'
import { withTimeout } from './errors'

// MVP Club prototype: staff-run tables with an opening chip count, a chip
// ledger and an audit log. Chips only, no rake, no currency.

export type ClubRole = 'owner' | 'manager' | 'cashier'
export type Kyc = 'pending' | 'verified' | 'blocked'

const KEY = 'straddle:club'

export function storedClubId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function forgetClub() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to forget
  }
}

export const canManage = (role: ClubRole | null | undefined) => role === 'owner' || role === 'manager'

// Calls a club function and throws its message, so screens can show it.
export async function clubRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await withTimeout(Promise.resolve(supabase.rpc(fn, args)))
  if (error) throw new Error(error.message)
  return data as T
}

// Prototype sign-in: an anonymous session joined to a demo club in a role.
export async function enterDemo(slot: 'A' | 'B', role: ClubRole, name: string): Promise<string> {
  const have = (await supabase.auth.getSession()).data.session
  if (!have) {
    const { error } = await withTimeout(supabase.auth.signInAnonymously())
    if (error) throw new Error(error.message)
  }
  const id = await clubRpc<string>('club_claim_demo', { p_slot: slot, p_role: role, p_name: name })
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // storage blocked: the club page will ask again
  }
  return id
}

export function parseChips(s: string): number {
  const n = Number(s.replace(/[, ]/g, ''))
  return Number.isFinite(n) ? Math.floor(n) : NaN
}

export const fmt = (n: number | null | undefined) => (n == null ? '-' : n.toLocaleString('en-US'))

export type ClubMember = {
  id: string
  full_name: string
  phone: string | null
  kyc_status: Kyc
  id_type: string | null
  id_last4: string | null
  block_reason: string | null
  share_consent: boolean
}

export type ClubTable = {
  id: string
  club_id: string
  name: string
  status: 'scheduled' | 'open' | 'closed'
  opening_chips: number | null
  closing_chips: number | null
  variance: number | null
  created_at: string
}
