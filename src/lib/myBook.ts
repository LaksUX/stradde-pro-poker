import { chipMultiplier } from './chips'
import { loadBook, totalNet, type CardData } from './playerCard'

// "My book": everything a player keeps on this phone. Which cards (groups) they
// have opened, plus nights they log themselves at places that do not use
// Straddle. All of it lives in this browser's storage and never leaves the phone.

const CARDS_KEY = 'straddle:cards'
const OWN_KEY = 'straddle:own'
const INCLUDE_KEY = 'straddle:own-included'

export type KnownCard = { token: string; group: string | null; name: string | null }

export type OwnGame = {
  id: string
  place: string
  date: string // YYYY-MM-DD
  entries: number
  finished: number // same units the app shows: 1 buy-in = 10,000
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
  return read<KnownCard[]>(CARDS_KEY, [])
}

export function rememberCard(token: string, card: Pick<CardData, 'group' | 'name'>) {
  const rest = knownCards().filter((c) => c.token !== token)
  write(CARDS_KEY, [{ token, group: card.group, name: card.name }, ...rest])
}

export function ownGames(): OwnGame[] {
  return read<OwnGame[]>(OWN_KEY, []).sort((a, b) => b.date.localeCompare(a.date))
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
  return Math.round(g.finished - g.entries * chipMultiplier('1:1'))
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
