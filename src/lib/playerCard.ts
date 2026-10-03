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

// ---------------------------------------------------------------------------
// Local PIN lock. Casual privacy only (stops someone glancing through your
// phone): a salted SHA-256 of the PIN lives in this browser's storage and is
// never sent anywhere. Forgot it? Remove the card from the Home Screen and
// reopen the link; only your notes are lost.
// ---------------------------------------------------------------------------
const lockKey = (token: string) => `straddle:cardlock:${token}`

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hasLock(token: string): boolean {
  try {
    return localStorage.getItem(lockKey(token)) != null
  } catch {
    return false
  }
}

export async function setLock(token: string, pin: string): Promise<void> {
  const salt = crypto.randomUUID()
  const hash = await sha256(`${salt}:${pin}`)
  localStorage.setItem(lockKey(token), JSON.stringify({ salt, hash }))
}

export function removeLock(token: string) {
  try {
    localStorage.removeItem(lockKey(token))
  } catch {
    // nothing to remove
  }
}

export async function checkLock(token: string, pin: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem(lockKey(token))
    if (!raw) return true
    const { salt, hash } = JSON.parse(raw) as { salt: string; hash: string }
    return (await sha256(`${salt}:${pin}`)) === hash
  } catch {
    return true
  }
}

// ---------------------------------------------------------------------------
// Backup: a plain JSON file of what only lives on this phone (notes, hidden
// nights) plus the last copy of the card. Importing merges it back in.
// ---------------------------------------------------------------------------
export type BookExport = {
  app: 'straddle-card'
  v: 1
  token: string
  exportedAt: string
  notes: Record<string, string>
  hidden: Record<string, true>
  card: CardData | null
}

export function exportBook(token: string, book: LocalBook): BookExport {
  return {
    app: 'straddle-card',
    v: 1,
    token,
    exportedAt: new Date().toISOString(),
    notes: book.notes,
    hidden: book.hidden,
    card: book.card,
  }
}

// Returns the merged book, or throws a readable error.
export function mergeImport(token: string, book: LocalBook, raw: string): LocalBook {
  let data: BookExport
  try {
    data = JSON.parse(raw) as BookExport
  } catch {
    throw new Error('That file is not a card backup')
  }
  if (data?.app !== 'straddle-card' || data.v !== 1) throw new Error('That file is not a card backup')
  if (data.token !== token) throw new Error('This backup belongs to a different card')
  return {
    ...book,
    notes: { ...data.notes, ...book.notes },
    hidden: { ...data.hidden, ...book.hidden },
  }
}
