import { supabase } from './supabase'
import { toChips, type ChipRatio } from './chips'

// MVP 2.0 player card. The server hands back one player's nights for one
// host (get_player_card, migration 0022). Everything personal (notes) lives only in
// this phone's localStorage and is never sent anywhere.

export type CardSettlement = {
  direction: 'pay' | 'receive'
  other_name: string | null
  amount: number
  status: 'pending' | 'confirmed' | 'disputed'
}

export type CardNight = {
  game_id: string
  at: string
  status: 'live' | 'closed'
  stake: number
  chip_ratio: ChipRatio
  cashout: number | null
  buyins: number
  settlements?: CardSettlement[]
}

export type CardData = {
  name: string | null
  group: string | null
  nights: CardNight[]
}

export type LocalBook = {
  card: CardData | null
  notes: Record<string, string>
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
  return { card: null, notes: {}, syncedAt: null }
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

// The message a host sends with a player's card link: readable game details
// first, the link last. Chat apps always show a pasted link, so it sits alone
// on its own line under a plain sentence.
export function cardMessage(opts: {
  playerName: string
  gameName: string
  gameDate: string
  playerCount: number
  url: string
}): string {
  const first = opts.playerName.trim().split(/\s+/)[0] || 'there'
  const day = new Date(opts.gameDate).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const who = `${opts.playerCount} player${opts.playerCount === 1 ? '' : 's'}`
  return `Hi ${first},\n${opts.gameName} · ${day} · ${who}\nYour private card, with your night and settlement:\n${opts.url}`
}

// So a player who opens the bare site address (or loses the chat link) lands
// back on their card instead of a sign-in screen.
const LAST_CARD_KEY = 'straddle:lastcard'
export function rememberLastCard(token: string) {
  try {
    localStorage.setItem(LAST_CARD_KEY, token)
  } catch {
    // storage blocked: nothing to remember
  }
}
export function lastCardToken(): string | null {
  try {
    return localStorage.getItem(LAST_CARD_KEY)
  } catch {
    return null
  }
}
