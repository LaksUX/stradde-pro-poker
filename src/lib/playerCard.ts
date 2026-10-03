import { supabase } from './supabase'
import { toChips, type ChipRatio } from './chips'

// MVP 2.0 player card. The server hands back one player's nights for one
// host (get_player_card, migration 0022). Everything personal — notes and
// hidden nights — lives only in this phone's localStorage and is never sent
// anywhere.

export type CardNight = {
  game_id: string
  at: string
  status: 'live' | 'closed'
  stake: number
  chip_ratio: ChipRatio
  cashout: number | null
  buyins: number
}

export type CardData = {
  name: string | null
  group: string | null
  nights: CardNight[]
}

export type LocalBook = {
  card: CardData | null
  notes: Record<string, string>
  hidden: Record<string, true>
  syncedAt: string | null
}

const key = (token: string) => `straddle:card:${token}`

export function loadBook(token: string): LocalBook {
  try {
    const raw = localStorage.getItem(key(token))
    if (raw) return JSON.parse(raw) as LocalBook
  } catch {
    // fall through to an empty book
  }
  return { card: null, notes: {}, hidden: {}, syncedAt: null }
}

export function saveBook(token: string, book: LocalBook) {
  try {
    localStorage.setItem(key(token), JSON.stringify(book))
  } catch {
    // storage full or blocked — the card still works, just not offline
  }
}

// null = the link is not (or no longer) valid; throws on network failure.
export async function fetchCard(token: string): Promise<CardData | null> {
  const { data, error } = await supabase.rpc('get_player_card', { p_token: token })
  if (error) throw error
  return (data as CardData | null) ?? null
}

// Net for a finished night, in display units. null while still in play.
export function nightNet(n: CardNight): number | null {
  if (n.cashout == null) return null
  return toChips(Number(n.cashout) - Number(n.buyins) * Number(n.stake), n.chip_ratio)
}

export function totalNet(nights: CardNight[]): number {
  return nights.reduce((sum, n) => sum + (nightNet(n) ?? 0), 0)
}

export function cardUrl(token: string): string {
  return `${window.location.origin}/c/${token}`
}
