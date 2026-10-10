import { chipMultiplier } from './chips'
import { fetchCard, fetchSiblings, loadBook, saveBook, totalNet, type CardData, type CardSibling } from './playerCard'

// "My book": everything a player keeps on this phone. Which cards (groups) they
// have opened, plus nights they log themselves at places that do not use
// Straddle. All of it lives in this browser's storage and never leaves the phone.

const CARDS_KEY = 'straddle:cards'
const OWN_KEY = 'straddle:own'
const INCLUDE_KEY = 'straddle:own-included'
const ME_KEY = 'straddle:me-tokens'
const DISMISSED_KEY = 'straddle:sibling-dismissed'

export type PlaceKind = 'house' | 'club'

export type KnownCard = { token: string; group: string | null; name: string | null; kind: PlaceKind; hosted?: boolean }

export type OwnGame = {
  id: string
  place: string
  kind: PlaceKind
  date: string // YYYY-MM-DD
  // What the player says they won or lost, in value. New games only need this.
  net?: number
  // Older entries recorded entries and what they finished with instead.
  entries?: number
  finished?: number // same units the app shows: 1 buy-in = 10,000
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked: the page still works for this visit
  }
}

export function knownCards(): KnownCard[] {
  return read<KnownCard[]>(CARDS_KEY, []).map((c) => ({ ...c, kind: c.kind ?? 'house' }))
}

// `hosted` marks the card the person holds for games they run themselves; once
// set it stays set when the card is refreshed later.
export function rememberCard(
  token: string,
  card: Pick<CardData, 'group' | 'name' | 'kind'>,
  opts: { hosted?: boolean } = {}
) {
  const all = knownCards()
  const before = all.find((c) => c.token === token)
  const rest = all.filter((c) => c.token !== token)
  const hosted = opts.hosted ?? before?.hosted
  write(CARDS_KEY, [
    { token, group: card.group, name: card.name, kind: card.kind ?? 'house', ...(hosted ? { hosted } : {}) },
    ...rest,
  ])
}

export function ownGames(): OwnGame[] {
  return read<OwnGame[]>(OWN_KEY, [])
    .map((g) => ({ ...g, kind: g.kind ?? 'house' }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function saveOwnGame(game: OwnGame) {
  const rest = ownGames().filter((g) => g.id !== game.id)
  write(OWN_KEY, [game, ...rest])
}

export function deleteOwnGame(id: string) {
  write(
    OWN_KEY,
    ownGames().filter((g) => g.id !== id)
  )
}

export function ownNet(g: OwnGame): number {
  if (g.net != null) return Math.round(g.net)
  return Math.round((g.finished ?? 0) - (g.entries ?? 0) * chipMultiplier('1:1'))
}

export function includeOwn(): boolean {
  return read<boolean>(INCLUDE_KEY, true)
}

export function setIncludeOwn(v: boolean) {
  write(INCLUDE_KEY, v)
}

// A card's total from the copy saved on this phone.
export function cardTotal(token: string): number {
  const nights = loadBook(token).card?.nights ?? []
  return totalNet(nights)
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2)
}

// ---------------------------------------------------------------------------
// Same person at several hosts. Once a player says "yes, that is me" for a
// card, every other card for that person is added to this phone's book
// automatically, now and whenever a new host seats them. Until they say so,
// the other places are only offered, never added.
// ---------------------------------------------------------------------------

function tokenSet(key: string): Set<string> {
  return new Set(read<string[]>(key, []))
}

export function markMe(tokens: string[]) {
  const all = tokenSet(ME_KEY)
  for (const t of tokens) all.add(t)
  write(ME_KEY, [...all])
}

export function dismissSiblings(tokens: string[]) {
  const all = tokenSet(DISMISSED_KEY)
  for (const t of tokens) all.add(t)
  write(DISMISSED_KEY, [...all])
}

export async function addCardToBook(token: string): Promise<void> {
  const card = await fetchCard(token)
  if (!card) return
  saveBook(token, { ...loadBook(token), card, syncedAt: new Date().toISOString() })
  rememberCard(token, card)
}

// Looks for this person's other cards. Confirmed players get them added;
// anyone else gets the list back to ask "is this you?".
export async function adoptSiblings(token: string): Promise<{ added: number; pending: CardSibling[] }> {
  const siblings = await fetchSiblings(token)
  const known = new Set(knownCards().map((c) => c.token))
  const fresh = siblings.filter((s) => !known.has(s.token))
  const me = tokenSet(ME_KEY)
  if (me.has(token)) {
    for (const s of fresh) {
      await addCardToBook(s.token).catch(() => {})
      me.add(s.token)
    }
    write(ME_KEY, [...me])
    return { added: fresh.length, pending: [] }
  }
  const dismissed = tokenSet(DISMISSED_KEY)
  return { added: 0, pending: fresh.filter((s) => !dismissed.has(s.token)) }
}
