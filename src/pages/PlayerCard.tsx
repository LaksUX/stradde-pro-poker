import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, ChevronRight, NotebookPen, Plus } from 'lucide-react'
import { PageSpinner } from '../components/ui/spinner'
import { Button } from '../components/ui/button'
import { InstallPrompt } from '../components/ui/install-prompt'
import { useCountUp } from '../hooks/useCountUp'
import { toChips } from '../lib/chips'
import {
  addCardToBook,
  adoptSiblings,
  cardTotal,
  dismissSiblings,
  knownCards,
  markMe,
  ownGames,
  ownNet,
  rememberCard,
  type OwnGame,
} from '../lib/myBook'
import { OwnGameSheet } from '../components/ui/own-game-sheet'
import { toast } from '../lib/toast'
import { cn } from 'cn'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet'
import {
  fetchCard,
  markSettlement,
  rememberLastCard,
  loadBook,
  checkRecord,
  nightNet,
  saveBook,
  totalNet,
  type CardNight,
  type CardSettlement,
  type LocalBook,
  type MyRecord,
} from '../lib/playerCard'

function signed(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US')
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0'
}

function tone(n: number | null): string {
  if (n == null || n === 0) return 'text-muted'
  return n > 0 ? 'text-win' : 'text-error'
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// Points the page at a real manifest URL unique to this card so "Install" /
// "Add to Home Screen" saves THIS card: start_url carries the token, so the
// installed app opens straight to it with no sign-in. See api/card-manifest.js.
// Restores the app's own manifest on leave.
function useCardManifest(token: string | undefined, title: string) {
  useEffect(() => {
    if (!token) return
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const prevHref = link?.getAttribute('href') ?? null
    const prevTitle = document.title
    link?.setAttribute('href', `/api/card-manifest?t=${encodeURIComponent(token)}&n=${encodeURIComponent(title)}`)
    document.title = title
    let appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    const prevApple = appleTitle?.content
    if (!appleTitle) {
      appleTitle = document.createElement('meta')
      appleTitle.name = 'apple-mobile-web-app-title'
      document.head.appendChild(appleTitle)
    }
    appleTitle.content = title
    return () => {
      if (link && prevHref) link.setAttribute('href', prevHref)
      document.title = prevTitle
      if (appleTitle && prevApple != null) appleTitle.content = prevApple
    }
  }, [token, title])
}

// MVP 2.0 player card (/c/:token): public, no sign-in. Results come from the
// host; notes are saved only on this phone.
export function PlayerCard() {
  const { token } = useParams()
  const [book, setBook] = useState<LocalBook>(() =>
    token ? loadBook(token) : { card: null, notes: {}, syncedAt: null }
  )
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'offline'>(
    book.card ? 'ready' : 'loading'
  )
  const [noteNight, setNoteNight] = useState<string | null>(null)
  // Games the player records themselves, and the other places they play.
  const [own, setOwn] = useState<OwnGame[]>(() => ownGames())
  const [editingOwn, setEditingOwn] = useState<OwnGame | 'new' | null>(null)
  // Other places the same person plays: offered once, added on a yes.
  const [siblings, setSiblings] = useState<{ token: string; group: string }[]>([])

  const title = book.card
    ? `${book.card.group ?? 'Game night'} · ${book.card.name ?? 'Me'}`
    : 'Your card'
  useCardManifest(token, title)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetchCard(token)
      .then((card) => {
        if (cancelled) return
        if (!card) {
          setStatus('invalid')
          return
        }
        setBook((prev) => {
          const next = { ...prev, card, syncedAt: new Date().toISOString() }
          saveBook(token, next)
          return next
        })
        rememberLastCard(token)
        rememberCard(token, card)
        setStatus('ready')
        adoptSiblings(token)
          .then((r) => !cancelled && setSiblings(r.pending))
          .catch(() => {})
      })
      .catch(() => {
        if (!cancelled) setStatus((s) => (s === 'loading' ? 'offline' : s))
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function addSiblings() {
    if (!token) return
    markMe([token, ...siblings.map((x) => x.token)])
    for (const x of siblings) await addCardToBook(x.token).catch(() => {})
    setSiblings([])
    toast.success('Added to your book')
  }

  function notMe() {
    dismissSiblings(siblings.map((x) => x.token))
    setSiblings([])
  }

  // Mark / un-mark / dispute one of my settlement lines, then refresh the card.
  async function onMark(
    st: CardSettlement,
    action: 'mark' | 'unmark' | 'dispute',
    method?: 'in_person' | 'transferred'
  ) {
    if (!token || !st.id) return
    try {
      await markSettlement(token, st.id, action, method)
      const card = await fetchCard(token)
      if (card) {
        setBook((prev) => {
          const next = { ...prev, card, syncedAt: new Date().toISOString() }
          saveBook(token, next)
          return next
        })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that. Try again.')
    }
  }

  function update(patch: Partial<LocalBook>) {
    if (!token) return
    setBook((prev) => {
      const next = { ...prev, ...patch }
      saveBook(token, next)
      return next
    })
  }

  const nights = book.card?.nights ?? []
  const net = totalNet(nights)
  const shownNet = useCountUp(net)

  if (status === 'loading') return <PageSpinner />

  if (status === 'invalid' || (status === 'offline' && !book.card)) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center p-6 text-center">
        <h1 className="type-page-title text-ink">
          {status === 'invalid' ? 'This card link is no longer valid' : "Can't reach the card right now"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {status === 'invalid'
            ? 'Ask your host for a fresh link.'
            : 'Check your connection and open it again.'}
        </p>
      </div>
    )
  }


  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted">{book.card?.group ?? 'Game night'}</p>
          <h1 className="mt-0.5 text-3xl font-bold text-ink">Hi {book.card?.name ?? 'there'}</h1>
        </div>
      </div>

      <div className="summary-dark mt-5 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <span className="type-label-caption text-muted">
            Your book · {nights.length} night{nights.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className={cn('type-figure-hero mt-3', tone(net))}>{signed(shownNet)}</p>
        <p className="mt-2 text-xs text-muted">
          {book.syncedAt
            ? status === 'offline'
              ? 'Offline — showing what was saved on this phone'
              : 'Up to date'
            : ''}
        </p>
      </div>

      {siblings.length > 0 && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-ink">Is this you?</p>
          <p className="mt-1 text-xs text-muted">
            {book.card?.name ?? 'You'} also plays at {siblings.map((x) => x.group).join(', ')}. Add{' '}
            {siblings.length === 1 ? 'it' : 'them'} to your book so everything is in one place.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={addSiblings}>Yes, add</Button>
            <Button variant="secondary" onClick={notMe}>
              Not me
            </Button>
          </div>
        </div>
      )}

      <InstallPrompt label={book.card?.group ?? 'your card'} />

      <h2 className="type-label-caption mt-6 mb-2 text-muted">Nights</h2>
      {nights.length === 0 ? (
        <p className="rounded-xl border border-hairline bg-canvas p-5 text-center text-sm text-muted">
          Nothing here yet. Your nights show up automatically.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
          {nights.map((n) => (
            <NightRow
              key={n.game_id}
              night={n}
              note={book.notes[n.game_id] ?? ''}
              record={book.records?.[n.game_id]}
              onOpen={() => setNoteNight(n.game_id)}
              onMark={onMark}
            />
          ))}
        </div>
      )}

      {(() => {
        const others = knownCards().filter((c) => c.token !== token)
        return (
          <>
            {others.length > 0 && (
              <>
                <h2 className="type-label-caption mt-6 mb-2 text-muted">Other places you play</h2>
                <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
                  {others.map((c) => {
                    const t = cardTotal(c.token)
                    return (
                      <Link
                        key={c.token}
                        to={`/c/${c.token}`}
                        className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink">{c.group ?? 'Game night'}</span>
                          <span className="text-xs text-muted">{c.kind === 'club' ? 'Club' : 'Home game'}</span>
                        </span>
                        <span className={cn('type-figure-md', tone(t))}>{signed(t)}</span>
                        <ChevronRight className="h-4 w-4 text-muted" />
                      </Link>
                    )
                  })}
                </div>
              </>
            )}

            <h2 className="type-label-caption mt-6 mb-2 text-muted">Games outside Straddle</h2>
            {own.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
                {own.map((g) => {
                  const n = ownNet(g)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setEditingOwn(g)}
                      className="flex w-full items-center gap-3 border-b border-hairline px-4 py-3 text-left last:border-b-0"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{g.place}</span>
                        <span className="text-xs text-muted">Self-reported · {g.date}</span>
                      </span>
                      {n != null ? (
                        <span className={cn('type-figure-md', tone(n))}>{signed(n)}</span>
                      ) : (
                        <span className="text-sm text-muted">Finished {(g.finished ?? 0).toLocaleString('en-US')}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            <Button variant="secondary" block className="mt-3" onClick={() => setEditingOwn('new')}>
              <Plus className="mr-2 h-4 w-4" /> Add a game I played
            </Button>
          </>
        )
      })()}

      <OwnGameSheet
        game={editingOwn}
        defaultKind="house"
        places={Array.from(new Set(own.map((g) => g.place)))}
        onClose={() => setEditingOwn(null)}
        onSaved={() => {
          setOwn(ownGames())
          setEditingOwn(null)
        }}
      />

      <p className="mt-6 text-center text-xs text-muted">
        Only you can see this card. Your records and notes stay on this phone.
      </p>

      <NoteSheet
        night={nights.find((n) => n.game_id === noteNight) ?? null}
        record={noteNight ? book.records?.[noteNight] : undefined}
        onRecord={(rec) => noteNight && update({ records: { ...(book.records ?? {}), [noteNight]: rec } })}
        note={noteNight ? (book.notes[noteNight] ?? '') : ''}
        onChange={(text) => noteNight && update({ notes: { ...book.notes, [noteNight]: text } })}
        onClose={() => setNoteNight(null)}
      />
    </div>
  )
}

function NightRow({
  night,
  note,
  record,
  onOpen,
  onMark,
}: {
  night: CardNight
  note: string
  record: MyRecord | undefined
  onOpen: () => void
  onMark: (st: CardSettlement, action: 'mark' | 'unmark' | 'dispute', method?: 'in_person' | 'transferred') => void
}) {
  const net = nightNet(night)
  const buyins = Number(night.buyins)
  const [markFor, setMarkFor] = useState<CardSettlement | null>(null)
  const check = checkRecord(night, record)
  return (
    <div className="border-b border-hairline last:border-b-0">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{formatDay(night.at)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {night.status === 'live' ? 'In play · ' : ''}
            {buyins} entr{buyins === 1 ? 'y' : 'ies'}
            {night.cashout != null ? ` · counted ${toChips(Number(night.cashout), night.chip_ratio).toLocaleString('en-US')}` : ''}
            {night.chip_ratio === '1:2' ? ' · 1:2, result at half value' : ''}
          </p>
          {check.state !== 'empty' && (
            <p
              className={cn(
                'mt-0.5 text-xs font-semibold',
                check.state === 'match' ? 'text-win' : check.state === 'differs' ? 'text-error' : 'text-muted'
              )}
            >
              {check.state === 'match'
                ? 'My record matches the host'
                : check.state === 'differs'
                  ? 'My record differs from the host'
                  : 'My record saved'}
            </p>
          )}
        </div>
        <span className={cn('type-figure-md', tone(net))}>{net == null ? '…' : signed(net)}</span>
      </button>
      {night.settlements && night.settlements.length > 0 && (
        <div className="mx-4 mb-3 rounded-md bg-surface-soft px-3 py-2">
          <p className="type-label-caption text-muted">Settlement</p>
          {night.settlements.map((st, i) => (
            <SettlementLine
              key={st.id ?? i}
              st={st}
              ratio={night.chip_ratio}
              onMarkStart={() => setMarkFor(st)}
              onMark={onMark}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="mx-4 mb-3 flex w-[calc(100%-2rem)] items-start gap-2 text-left text-xs text-muted hover:text-ink"
      >
        <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className={cn('min-w-0 flex-1 break-words', note ? 'text-body' : '')}>
          {note ? note : 'Add my record or a note'}
        </span>
      </button>

      <Sheet open={markFor != null} onOpenChange={(open) => !open && setMarkFor(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>How was it settled?</SheetTitle>
          </SheetHeader>
          <p className="mt-1 text-sm text-body">
            {markFor?.direction === 'pay' ? `You and ${markFor.other_name ?? 'them'}` : `${markFor?.other_name ?? 'They'} and you`}{' '}
            both need to mark it before it counts as settled.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {(
              [
                ['in_person', 'In person'],
                ['transferred', 'Transferred'],
              ] as const
            ).map(([m, label]) => (
              <Button
                key={m}
                variant="secondary"
                className="h-16 text-base"
                onClick={() => {
                  if (markFor) onMark(markFor, 'mark', m)
                  setMarkFor(null)
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

const METHOD_LABEL = { in_person: 'in person', transferred: 'transferred' } as const

function SettlementLine({
  st,
  ratio,
  onMarkStart,
  onMark,
}: {
  st: CardSettlement
  ratio: CardNight['chip_ratio']
  onMarkStart: () => void
  onMark: (st: CardSettlement, action: 'mark' | 'unmark' | 'dispute', method?: 'in_person' | 'transferred') => void
}) {
  const other = st.other_name ?? 'them'
  const state = st.state ?? 'pending'
  const canAct = !!st.id
  const method = st.method ? METHOD_LABEL[st.method] : null
  return (
    <div className="mt-2 border-t border-hairline pt-2 first:mt-1 first:border-t-0 first:pt-0">
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-body">
          {st.direction === 'pay' ? `Pay ${st.other_name ?? 'someone'}` : `${st.other_name ?? 'Someone'} pays you`}
        </span>
        <span className={cn('type-figure-md', st.direction === 'pay' ? 'text-error' : 'text-win')}>
          {toChips(Number(st.amount), ratio).toLocaleString('en-US')}
        </span>
      </p>

      {state === 'settled' && (
        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-win/10 px-2 py-0.5 text-xs font-semibold text-win">
          <BadgeCheck className="h-3.5 w-3.5" /> Settled{method ? ` · ${method}` : ''}
        </p>
      )}

      {state === 'marked_by_me' && (
        <p className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
          <span>You marked it. Waiting for {other} to agree.</span>
          {canAct && (
            <button type="button" className="cta-soft font-semibold text-ink" onClick={() => onMark(st, 'unmark')}>
              Undo
            </button>
          )}
        </p>
      )}

      {state === 'marked_by_other' && (
        <div className="mt-1">
          <p className="text-xs text-muted">
            {other} says it is settled{method ? ` (${method})` : ''}. Is that right?
          </p>
          {canAct && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => onMark(st, 'mark', st.method ?? 'in_person')}>
                Yes, settled
              </Button>
              <Button size="sm" variant="outline" onClick={() => onMark(st, 'dispute')}>
                Something is off
              </Button>
            </div>
          )}
        </div>
      )}

      {state === 'disputed' && (
        <div className="mt-1">
          <p className="text-xs text-error">Flagged. Sort it out with {other} or your host.</p>
          {canAct && (
            <Button size="sm" variant="outline" className="mt-2" onClick={onMarkStart}>
              Mark settled
            </Button>
          )}
        </div>
      )}

      {state === 'pending' && canAct && (
        <Button size="sm" variant="secondary" className="mt-2" onClick={onMarkStart}>
          Mark settled
        </Button>
      )}
    </div>
  )
}

// A bottom sheet for the night: my own record (what I bought in and finished
// with) and a private note. Both are saved on this phone as you type. Once the
// host has entered the night, my record is compared with theirs.
function NoteSheet({
  night,
  record,
  onRecord,
  note,
  onChange,
  onClose,
}: {
  night: CardNight | null
  record: MyRecord | undefined
  onRecord: (rec: MyRecord) => void
  note: string
  onChange: (text: string) => void
  onClose: () => void
}) {
  const rec: MyRecord = record ?? { entries: '', finished: '' }
  const check = night ? checkRecord(night, record) : ({ state: 'empty' } as const)
  const input =
    'h-12 w-full rounded-md border border-hairline bg-surface-soft px-3 text-base text-ink outline-none focus:border-primary'
  return (
    <Sheet open={night != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{night ? formatDay(night.at) : 'Note'}</SheetTitle>
        </SheetHeader>

        <h3 className="type-label-caption mt-3 text-muted">My record</h3>
        <p className="mt-1 text-xs text-muted">
          What you counted yourself, in value. Only on this phone. When the host enters the night, we compare.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            My entries
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className={input}
              value={rec.entries}
              onChange={(e) => onRecord({ ...rec, entries: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            {night?.chip_ratio === '1:2' ? 'Value I finished with (chips × ½)' : 'What I finished with'}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className={input}
              value={rec.finished}
              onChange={(e) => onRecord({ ...rec, finished: e.target.value })}
            />
          </label>
        </div>
        {check.state === 'waiting' && (
          <p className="mt-2 text-xs text-muted">Waiting for the host to enter the night.</p>
        )}
        {check.state === 'match' && <p className="mt-2 text-xs font-semibold text-win">Matches the host.</p>}
        {check.state === 'differs' && (
          <div className="mt-2 rounded-md bg-error/10 p-3 text-xs text-error">
            {check.entryDiff !== 0 && (
              <p>
                Host has {check.hostEntries} entr{check.hostEntries === 1 ? 'y' : 'ies'}, you have{' '}
                {check.hostEntries + check.entryDiff}.
              </p>
            )}
            {check.valueDiff !== 0 && (
              <p>
                Host has {check.hostValue.toLocaleString('en-US')}, you have{' '}
                {(check.hostValue + check.valueDiff).toLocaleString('en-US')} (
                {Math.abs(check.valueDiff).toLocaleString('en-US')} apart).
              </p>
            )}
            <p className="mt-1 text-muted">Worth checking with your host.</p>
          </div>
        )}

        <h3 className="type-label-caption mt-5 text-muted">Note</h3>
        <textarea
          aria-label="Your note"
          rows={3}
          value={note}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What do you want to remember about this night?"
          className="mt-2 w-full resize-none rounded-md border border-hairline bg-surface-soft p-3 text-base text-ink outline-none focus:border-primary"
        />
        <Button block className="mt-4" onClick={onClose}>
          Done
        </Button>
      </SheetContent>
    </Sheet>
  )
}
