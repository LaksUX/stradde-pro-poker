import { supabase } from './supabase'
import { netValue, toChips, valueFactor, type ChipRatio } from './chips'

// MVP 2.0 player card. The server hands back one player's nights for one
// host (get_player_card, migration 0022). Everything personal (notes) lives only in
// this phone's localStorage and is never sent anywhere.

export type CardSettlement = {
  id?: string
  direction: 'pay' | 'receive'
  other_name: string | null
  amount: number
  status: 'pending' | 'confirmed' | 'disputed'
  // Older copies saved on a phone have no state: treated as pending.
  state?: 'pending' | 'marked_by_me' | 'marked_by_other' | 'settled' | 'disputed'
  method?: 'in_person' | 'transferred' | null
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
  // A house game or a club. Older copies saved on a phone have no kind: house.
  kind?: 'house' | 'club'
  nights: CardNight[]
}

// What the player says they bought in and finished with, kept on this phone.
// Typed values are kept as text so a half-typed number is not lost.
export type MyRecord = { entries: string; finished: string }

export type LocalBook = {
  card: CardData | null
  notes: Record<string, string>
  records?: Record<string, MyRecord>
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
  return toChips(netValue(Number(n.cashout), Number(n.buyins) * Number(n.stake), n.chip_ratio), n.chip_ratio)
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
  return `Hi ${first}, here's your ${opts.gameName} card:\n${opts.url}`
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

// Mark, un-mark or dispute one of the player's own settlement lines. The card
// link proves who they are; the database checks the line is theirs.
export async function markSettlement(
  token: string,
  transferId: string,
  action: 'mark' | 'unmark' | 'dispute',
  method?: 'in_person' | 'transferred'
): Promise<void> {
  const { error } = await supabase.rpc('mark_settlement', {
    p_token: token,
    p_transfer_id: transferId,
    p_action: action,
    p_method: method ?? null,
  })
  if (error) throw new Error(error.message)
}

export type CardSibling = { token: string; group: string; kind: 'house' | 'club' }

// The same person's cards at other hosts (migration 0032).
export async function fetchSiblings(token: string): Promise<CardSibling[]> {
  const { data, error } = await supabase.rpc('get_card_siblings', { p_token: token })
  if (error) throw new Error(error.message)
  return (data as CardSibling[]) ?? []
}

export type RecordCheck =
  | { state: 'empty' }
  | { state: 'waiting' }
  | { state: 'match' }
  | { state: 'differs'; hostEntries: number; hostValue: number; entryDiff: number; valueDiff: number }

// Compares the player's own record with what the host published. Only a night
// with a cash-out from the host is comparable; until then it is "waiting".
export function checkRecord(night: CardNight, rec: MyRecord | undefined): RecordCheck {
  if (!rec || (rec.entries.trim() === '' && rec.finished.trim() === '')) return { state: 'empty' }
  if (night.cashout == null) return { state: 'waiting' }
  const hostEntries = Number(night.buyins)
  // The record is in value: what the player finished with, at this table's ratio.
  const hostValue = Math.round(toChips(Number(night.cashout), night.chip_ratio) * valueFactor(night.chip_ratio))
  const entryDiff = rec.entries.trim() === '' ? 0 : Number(rec.entries) - hostEntries
  const valueDiff = rec.finished.trim() === '' ? 0 : Number(rec.finished) - hostValue
  if (entryDiff === 0 && valueDiff === 0) return { state: 'match' }
  return { state: 'differs', hostEntries, hostValue, entryDiff, valueDiff }
}

export type Rsvp = 'pending' | 'in' | 'maybe' | 'out'

export type CardUpcoming = {
  game_id: string
  name: string
  place: string | null
  at: string
  response: Rsvp
  arrive: string | null
  leave_by: string | null
  note: string | null
  going: number
}

export async function fetchUpcoming(token: string): Promise<CardUpcoming[]> {
  const { data, error } = await supabase.rpc('get_card_upcoming', { p_token: token })
  if (error) throw error
  return (data as CardUpcoming[] | null) ?? []
}

export async function sendRsvp(
  token: string,
  gameId: string,
  response: Exclude<Rsvp, 'pending'>,
  arrive: string | null,
  leaveBy: string | null,
  note: string | null
): Promise<void> {
  const { error } = await supabase.rpc('set_rsvp', {
    p_token: token,
    p_game_id: gameId,
    p_response: response,
    p_arrive: arrive,
    p_leave_by: leaveBy,
    p_note: note,
  })
  if (error) throw error
}

// "21:30" -> "9:30 PM" in the viewer's locale.
export function showTime(hhmm: string | null): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h || 0, m || 0, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
