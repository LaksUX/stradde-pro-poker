# Poker Night — Requirements

This is the source of truth for what the app does and why. Edit this file when a
requirement changes — the page-level prompts in `PAGE_PROMPTS.md` should be kept in
sync with whatever's decided here.

> **Revision note:** This pass closes several loopholes found during a pre-build
> review (identity linking, stake definition, rake formula, game lifecycle, edit/lock
> rules). Where a judgment call was made rather than dictated by prior text, it's
> marked **[decision]** so it's easy to spot and revisit.
>
> **Second revision note:** Adds the **live-capture experience** — the product bet
> that the app should beat the host's paper sheet at the moment of capture, not just
> digitize it afterward. This replaces "digitize the paper record after the game" as
> the primary flow with "capture live, with a shared table everyone can watch, and a
> photo-of-the-sheet import as a fallback, not the main path." See the new section
> below and the updated Invites / Known gaps sections.
>
> **Third revision note:** Adds a **venue** entity — a physical place's history,
> independent of any single host account, since the same daily game may rotate who's
> hosting. See the new Venues section for the entity itself, its dedup gap, and the
> deliberate call to keep player-level financials out of venue-level visibility.
>
> **Fourth revision note:** Replaces host-entered players with **self-join** —
> the host now only sets up a game (name, venue, stake) and shares one link; every
> player reaches the game by scanning it and typing their own name and phone number,
> or tapping a remembered one-tap rejoin. This removes the `unclaimed`/`claimed`
> bridge, the "Your players"/"Contacts" entry tabs, and the Complete Profile screen
> for the player track entirely — see the rewritten Access model, the updated Shared
> table view under Live-capture experience, and two new Known gaps around
> unverified self-asserted identity.
>
> **Fifth revision note:** Three changes that tighten money integrity and simplify
> distribution, at the cost of some of the earlier "everyone watches everything"
> transparency: (1) self-join now creates a **buy-in request** the host must confirm,
> rather than an instantly-granted buy-in — this is a genuine integrity fix, not just
> a policy tweak, since the old flow could credit a buy-in before the host had
> actually received any cash; (2) the shared table view is pulled back to names only,
> ranked by buy-in count, with no aggregate totals and no other player's exact
> number — a deliberate reversal of the earlier "communal reconciliation strip"
> decision; (3) settlement is no longer frozen at close — it becomes a separate,
> indefinitely host-editable layer, distributed through the same evolving link
> rather than WhatsApp Business API messaging, which this revision retires as a
> known gap entirely. Voice entry is removed; photo import is demoted further, to a
> true last resort. Game creation also gains an explicit, editable date/time field
> and pulls every field from the host's last game by default.
>
> **Sixth revision note:** A future-dated game now has a real **`scheduled`**
> status — no joining, no buy-ins, until the host explicitly starts it — rather than
> the date/time being purely descriptive. Buy-in count is no longer fixed at 1 per
> request: a player (or host) picks a count, minimum 1, via a shared slider+stepper
> component used identically on both sides. A new, host-only, off-by-default **chip
> ratio** display setting revives the paper sheet's old "x5" column as a pure
> annotation — it never touches the actual money math. Settlement change-requests
> now carry an optional proposed amount, alongside the unchanged buy-in/cash-out
> confirm tiers. Adds a soft-flagged **invite-only** mode, and expands Venue Detail
> with real charts and role-split per-game columns.
>
> **Seventh revision note:** Retires "Casino felt" entirely in favor of a warm,
> white-canvas theme sourced from `DESIGN-airbnb.md` — see the rewritten Theme
> section. This is a visual identity change only; nothing in this revision touches
> product behavior, data model, or any decision above it.
>
> **Eighth revision note:** Two simplifications. Chip ratio is now a plain `1:1` /
> `1:2` switch, not a free-number field. **Invite-only is removed entirely** — it
> added a second, softer trust concept (visible flagging) layered awkwardly on top
> of the real one (host-confirm), and wasn't earning its complexity. Money
> integrity was never resting on it; removing it costs nothing there.
>
> **Ninth revision note — corrects the previous revision.** The `1:1`/`1:2` ratio
> was wrongly scoped as a cosmetic, host-only, off-by-default annotation. It's
> actually core money model: it sets the real settlement value of a bank, defaults
> to `1:1` (not "off"), and is visible to hosts and players alike. **Chips** is
> introduced as the named, currency-free unit for that value — the figure people
> actually care about during settlement — while banks remain the (now subtly
> displayed) buy-in denomination. See the rewritten Money model and Dashboard
> sections.
>
> **Tenth revision note.** Adds **table size** (default 9, live-editable) and an
> auto-computed, host-overridable **full/open status**, covering the real pattern
> of a home game: seats turn over all night as players cash out and others walk
> in. "Full" only ever changes what the pre-join screen says — it's never a hard
> gate, staying consistent with host-confirm being the one real control everywhere
> else. Also adds a fast path for replacing a player, including one narrow,
> explicit exception to "host never types a player in" for a replacement who
> isn't using the app — see the new Table capacity & seat turnover section.
>
> **Eleventh revision note.** Retires the Airbnb-sourced warm consumer theme in
> favor of a professional fintech look — sourced from `DESIGN-mercury.md` (the new
> token source of truth, replacing `DESIGN-airbnb.md`) and pulled from business-
> banking dashboards (Mercury, Stripe, Ramp-class products) rather than a travel
> marketplace, since a ledger tracking real money between real people should read
> like a tool a treasurer would trust. See the rewritten Theme section below. Visual
> identity change only — no product behavior, data model, or prior decision changes.
>
> **Twelfth revision note.** Retires the light Mercury-sourced fintech theme in
> favor of a dark analytics-dashboard look — sourced from `DESIGN-dashboard.md`
> (the new token source of truth, replacing `DESIGN-mercury.md`) and pulled from a
> dark-mode sales/ops dashboard reference rather than a light banking UI. The
> canvas is near-black now, not white — still exactly one permanent theme, no
> toggle, just a dark one this time. Adds two real reusable components used only
> where a genuine either/or or multi-way state already existed in the product:
> `SegmentedControl` (Home's Player/Host switch, Live Game's rake masked/revealed
> and table status auto/open/full, Create Game's chip ratio and schedule-mode
> choices) and `StatCard` (the one hero number a screen exists to show — net
> chips on My Game and Game Detail, lifetime net on Home). Every money/count
> figure across the app now renders in monospace, not just tabular-nums. See the
> rewritten Theme section below. Visual/interaction identity change only — no
> product behavior, data model, or prior decision changes.
>
> **Thirteenth revision note.** Adds **hosting entities** — the foundation for
> many different hosting organizations sharing one ecosystem (an individual
> host today, a multi-staff club later), not just a single host_id per game.
> Deliberately additive and deliberately scoped down: every existing game's
> `host_id` stays the sole authority for every permission check in the app,
> unchanged; a new `hosting_entities` table and `games.hosting_entity_id`
> column sit alongside it as a parallel identity layer, tested first on
> today's ordinary solo hosts (auto-migrated into a `house`-type entity) before
> any club-only behavior is built. The one real feature shipped on this layer
> so far: a hosting entity's **permanent link** (`/e/:slug`) — unlike a game's
> one-off `/t/:gameId` link, reminted every night, this one never changes and
> always resolves to whichever game is live or scheduled for that entity right
> now. See the new Hosting entities section below. `club` as a type, staff
> rosters, club-level approval, and any paid tier are designed but explicitly
> not built yet — this revision is the foundation, not the club itself.
>
> **Fourteenth revision note — corrects the previous ratio direction.** `1:2`
> was implemented (and documented, in the Money model section below) as "1
> bank = 2 chips" — a bank worth *more* in chip terms. That was backwards.
> `1:2` now means **2 banks = 1 chip** — a chip is the coarser, larger-value
> unit, banks the finer one. `1:1` is unaffected (still numerically
> identical). Fixed at the single source of truth (`chipMultiplier()` in
> `src/lib/chips.ts`), so every screen's `toChips()` call already gets the
> corrected conversion — no per-screen changes needed beyond the one place
> that described the old direction in prose (Create Game's ratio caption).

## What this is

A money-tracking app for home poker games. A host runs a game, tracks each player's
buy-ins and cash-out, the app works out who owes whom, and everyone can see their own
history over time. No real-money payment processing — it's a ledger, not a wallet.

## Access model

- **Super admin** (the app owner) approves who is allowed to be a **host**. Nobody can
  create a game without admin approval — this keeps random signups from spinning up
  games.
- A **host** creates and runs games, and can also be a **player** in their own game.
- **[decision] Two identity tracks, on purpose.** Hosting is a privileged,
  admin-approved role and keeps the heavier onboarding it already has. Playing is not
  — and per the zero-friction goal below, it now needs none of that weight at all.
  - **Host track (unchanged):** email magic-link now, phone OTP later once Twilio's
    trial restrictions lift. Same as before.
  - **Player track (new): phone number *is* the identity, entered by the player
    themself, no email, no password, no OTP.** A player joins a specific game by
    typing their own name and phone number — nothing routes through host data entry
    or email at all. See "Joining a game" below for the full flow.
- **[decision] Phone numbers are normalized to E.164 format** (e.g. `+15550142`) at
  the moment a player types one in, and everywhere else a phone number is captured.
  This is the identity key for players — it has to be canonical from day one.

### Joining a game (self-join, host-confirmed — replaces "host adds player")

*(Revised.)* The host never types a player's name or phone number. But the host
**does** confirm every buy-in that enters the pot, including a joining player's
first one — because the host is the one physically holding the cash, and crediting
a buy-in before it's actually been handed over is a real integrity gap, not just a
friction question.

- **Scan or open the shared link** (see the Shared table / RSVP link under
  Live-capture experience — the same link serves joining, watching, and, later,
  settlement).
- **First time on this device:** name + phone, plus **a chosen buy-in count
  (minimum 1, via the shared slider+stepper control)** — the request specifies how
  many buy-ins the player wants, not always exactly one. No verification code (same
  rationale as before — Twilio OTP is blocked, and a code here would reintroduce
  exactly the friction self-join exists to remove). Submitting **creates a pending
  request for that count**, timestamped at the moment of the request, and shows the
  player a "waiting for the host to confirm" state.
- **Returning, remembered device:** one-tap "Continue as {name}" — if that identity
  hasn't yet been confirmed into this specific game, tapping it opens the same
  buy-in count picker before submitting a pending request; if they're already
  confirmed in, it goes straight to their live view. A visible "Not you? Switch"
  option always sits alongside the one-tap button.
- **The host sees pending requests on Live Game and confirms or declines each one
  — from the bottom sheet, the same surface used for every other buy-in action**
  (see Live-capture experience). Opening a pending request pre-fills the requested
  count on the same picker, adjustable before confirming. Confirming turns the
  request into a real, counted buy-in event and (for a join request) admits the
  player to the roster; declining removes it with no trace in the money model —
  nothing was ever counted, so there's nothing to unwind. **[decision] This
  replaces the previous revision's "remove within the 1-minute lock window" rule
  entirely** — a host now always has an unlimited window to reject an unwanted or
  mistaken request, because nothing is real until they act on it. Once confirmed,
  the normal 1-minute lock applies exactly as it does to any other buy-in.
- **Requesting more buy-ins mid-game** works the same way, same count picker: a
  joined player can tap "Request more buy-ins" from their own view; it shows as
  pending on the host's screen until confirmed or declined via the bottom sheet.
  **A host adding buy-ins directly to a player's row, from that same bottom sheet,
  is auto-confirmed immediately** — the confirm step exists specifically for
  player-initiated requests, not for the host's own actions.
- **Only confirmed buy-ins count toward any total** — the rake/settlement invariant,
  the overpay check, and every dashboard figure are computed from confirmed buy-in
  events only. A pending request is visible (so nobody wonders where it went) but
  financially invisible until the host acts.
- Rejoining from a new device still matches by phone (E.164 key), carrying lifetime
  history forward exactly as before — that part of self-join is unchanged.
- **[decision] "Your players" roster reuse and the "Contacts" tab remain removed**
  from game creation — self-join plus host-confirm replaces both the old add-a-player
  flow and the money-integrity gap the fully-automatic version of self-join had.

### Player identity — superseded by self-join

*(This section previously described a `claimed`/`unclaimed` bridge between a
host-added player row and a logged-in account. That bridge is gone — see "Joining a
game" above. A self-joined player's row and account are the same thing from the
moment they type their phone number.)*

- **Carried forward, unchanged:** if a phone number gets reused by a different real
  person over time, their old games' history attaches to the new owner. Still out of
  scope to solve — see Known gaps.
- **New host-side implication:** a host never sees an "unclaimed" state at all
  anymore, since there's no longer a window between a player existing in a game and
  owning that row. What a host does still see, mid-game, is a roster that fills in
  live as people join — see the updated Live-capture experience section.

## Money model

- **1 bank = 10,000** internal units. All UI amounts are expressed in banks, never in
  a currency symbol.
- **[decision] Buy-in amount is a game-level field, set by the host at game
  creation** (e.g. "2 banks per buy-in"), and applies uniformly to every player in
  that game — there's no per-player custom buy-in amount. This is the "stake" that
  the dashboard's net-trend chart later splits by (see Dashboard section) — it didn't
  have an explicit home before this revision.
- **[decision, revised] Buy-in count per request is chosen, minimum 1 — no longer
  fixed at exactly 1.** The previous revision's "every player is entitled to
  exactly 1 buy-in" is superseded: a join request or a mid-game "request more"
  now specifies how many buy-ins the requester wants (host or player, via the
  shared slider+stepper control — see `PAGE_PROMPTS.md`), with 1 as the floor and
  no fixed default beyond that. A request for N buy-ins is still a single unit for
  request/confirm purposes — the host confirms or declines the whole request, not
  each buy-in within it individually.
- **[decision] Game date and time are explicit, editable fields, captured at
  creation.** The original paper sheet always had these ("Date," "Start time") and
  the earlier digitization dropped them — this restores them. **[decision, revised]
  They now genuinely gate functionality**, not just describe it — see the new
  `scheduled` status under Game lifecycle. A host can date/time a game as "now" and
  go straight to `live`, or set one ahead of time and start it explicitly later.
- **[decision, revised — corrects the previous revision] Chips are the settlement
  value unit — this is core money model, not a cosmetic host-only annotation.**
  The earlier "off-by-default, host-only, never affects anything" framing was
  wrong. Restated properly:
  - **Banks** stay the buy-in denomination — what a player actually buys in with
    (e.g., "3 banks"). This number stays on screen but **subtle** — small,
    secondary text, everywhere it appears.
  - **Chips** are a new, named, currency-free unit representing the real value a
    bank carries — **this is the number that matters for settlement**, and the
    one shown prominently on host and player dashboards alike. "Chips" was chosen
    deliberately: it's the natural poker/casino term, ties back to the physical
    chips the paper sheet's old "Ratio" column was converting between, and reads
    as a unit rather than money — satisfying the "no currency units" rule while
    still being immediately intuitive.
  - **Every game sets a ratio at creation: `1:1` or `1:2`.** `1:1` means 1 bank =
    1 chip (no scaling — chips and banks are numerically identical, chips is just
    the settlement-facing name for the same number). `1:2` means 2 banks = 1 chip
    (a chip is worth double in bank terms — see the Fourteenth revision note,
    which corrects this from the original, backwards direction).
    **[decision] Defaults to `1:1`** so
    every game has a real, meaningful setting rather than an implied "off" state —
    this is no longer something most hosts will "never touch"; it's a real
    two-option choice made once per game, up front.
  - **[decision] Locked at creation, same as stake** — the ratio can't change once
    a game is `live` or `scheduled`, since changing it later would retroactively
    change the value of buy-ins already confirmed at the old ratio.
  - **[decision] Wherever a value is shown — settlement transfers, net, dashboard
    totals — chips is the primary figure. The underlying bank count (buy-ins,
    cash-out) stays visible but secondary**, per the pattern "subtle buy-ins,
    prominent value." This applies equally to host and player views — chips is not
    a host-only figure the way rake is.
  - The underlying ledger (buy-in events, cash-out entries, the rake/settlement
    invariant) still stores and computes in **banks** — chips is a display-layer
    conversion (`chips = banks × ratio-multiplier`) applied wherever a value is
    rendered, not a second parallel calculation. **1 bank remains 10,000 internal
    storage units regardless of ratio** — the ratio scales the chip *display*
    value, not the storage precision.
- Display amounts in **whole chips, no decimals**, as the primary figure (e.g. "12
  chips", not "12.4") — with whole banks as the secondary figure. Only the display
  layer rounds — all stored/calculated amounts stay full-precision.
  - **[decision] Rounding rule:** each individual figure (a player's buy-ins,
    cash-out, net) is rounded independently for display. A displayed total (e.g. sum
    of all buy-ins shown on a summary) is computed from the full-precision sum and
    *then* rounded once — it is not the sum of the already-rounded per-player
    numbers. The two can legitimately disagree by ±1 chip in the UI; that's
    expected and not a bug.
- Buy-ins **lock 1 minute after being confirmed** (not after being requested) — a
  host can't accidentally undo a buy-in a player already paid in. The slider used to
  add buy-ins can never be dragged below the already-locked count.
  - **[decision] Locked buy-ins are permanent — no override, including for admins.**
    If a host makes a genuine mistake (wrong player, wrong count) within the lock
    window they can fix it; after the lock, the only remedy is entering a correcting
    note or handling it as cash outside the app. This is a deliberate trust/integrity
    tradeoff (an editable "locked" value isn't really locked) and should be stated to
    hosts in-product, not just assumed.
- Once a player's cash-out is being entered, their buy-ins are **locked** — no more
  buy-ins for that player while cashing out.
- **[decision] A cash-out can be edited freely until the game is closed** (see Game
  lifecycle below), unlike buy-ins. Cash-out entry is inherently a one-time "count the
  stack" event that's more error-prone than a buy-in tap, so hosts need a correction
  window. Once the game closes, cash-outs lock permanently along with everything else.

### The rake/settlement invariant

This is the one formula everything else depends on — get it wrong and every payout is
wrong:

```
sum(all players' buy-ins) + rake = sum(all players' cash-outs)
```

**[decision] This formula is computed and stored entirely in banks — chips never
enter the calculation.** Chips are a display conversion applied after the fact to
whatever the formula produces (buy-ins, rake, cash-outs, net, transfers), per the
Money model's Chips decision above. This keeps the invariant itself simple and
ratio-independent, while everything a person actually reads on screen converts to
chips at render time.

- **Rake** is a single fixed amount the host sets, table-wide — not per player. It's
  skimmed off the table for hosting — it is **not** a player's win/loss, and it is
  **not** distributed as a player-to-player settlement transfer. The host already has
  it as physical cash taken off the table.
  - **[decision] Rake is editable by the host at any point before the game closes**,
    same as cash-outs, and locks on close. Editing rake after close is not allowed —
    it would silently change historical hosting stats.
- A player's **net** (for settlement purposes) = their cash-out − their buy-ins. Rake
  never touches this number.
- **Mid-game**, `buy-ins − cash-outs` being positive is normal — that's money still in
  play, not an error. The only real error is `cash-outs + rake` exceeding total
  buy-ins (paying out more than ever came in).
  - **[decision] Overpay handling:** entering a cash-out that would push
    `cash-outs + rake` over total buy-ins is **not blocked**, but shows an immediate,
    hard-to-miss warning banner naming the exact overage amount, both at entry time
    and persistently on the Live Game screen until resolved. It isn't blocked outright
    because the host may legitimately need to record a correction to an earlier
    buy-in or cash-out and the numbers may cross temporarily. It must never be
    silently allowed to pass unflagged.
- **Settlement transfers** (who pays whom) are computed purely from each player's net
  via debt-simplification (biggest winner matched against biggest loser, etc.). Rake
  never appears as a transfer line.
  - **[decision] Deterministic tie-break:** when two or more players have equal net
    (or equal remaining net mid-simplification), ties are broken by ascending
    `player_id`. This guarantees the same inputs always produce the same transfer
    list, which matters for testing and for players double-checking math across
    sessions.

## Game lifecycle

*(New section — the original doc described in-game mechanics but never stated when a
game is "done," which the settlement graph and dashboard stats both depend on.)*

- **[decision, revised] A game has a status: `scheduled`, `live`, or `closed`.**
  Creating a game for a future date/time now genuinely creates it in `scheduled`
  status, not just a `live` game with a descriptive date — reversing the previous
  revision's call that date/time was purely cosmetic.
  - **A `scheduled` game accepts no join requests and no buy-ins at all.** The
    Shared table / RSVP link resolves to a fourth state — "hasn't started yet,
    starts at [time]" — with no Join action rendered.
  - **[decision] Transitioning to `live` is an explicit host action** ("Start
    Game"), separate from creation. A host can create a game days ahead and start
    it the moment people actually sit down, or create one with "now" as the
    date/time and skip straight to `live` — Create Game's CTA reflects which path
    the host is on (see `PAGE_PROMPTS.md`).
  - A `scheduled` game's date/time remains editable up until it's started, same as
    any other field at creation.
- **[decision] Closing is an explicit host action** ("Close Game"), not inferred from
  every player having a cash-out — a host may want to review the settlement graph
  before formally closing, and some players may never cash out (walked away, house
  absorbs it) which shouldn't silently block closing forever.
- Closing a game is only allowed once the overpay check (above) passes — the host
  can't close a game that's currently in an invalid state.
- On close: all buy-ins, cash-outs, and rake for that game lock permanently — this
  part is unchanged and remains the money-integrity backbone. **[decision, revised]
  Settlement is different: it is computed at close but is NOT frozen.** It's a
  separate layer sitting on top of the frozen buy-in/cash-out numbers, and the host
  can adjust it — who pays whom, not just amounts — at any point after close, not
  only in the window before sending it out. See the rewritten Settlement section
  under Live-capture experience for why, and how this reaches players.
- Dashboard stats (Host tab totals, Player tab net-trend) only include **closed**
  games. A live game in progress doesn't yet count toward historical stats or
  averages, to avoid a half-finished game skewing "average pot" or a trend line.

## Table capacity & seat turnover

*(New section.)* A home game rarely holds a fixed roster all night — players cash
out early, new people walk in, and someone's seat gets taken by whoever showed up
next. This section covers how the app signals "the table's full" and how a seat
gets handed off, without ever turning that signal into a hard block.

- **[decision] `Table size`** — a host-set number, defaulting to **9**, editable at
  any time during a `live` game (unlike stake or chip ratio, which lock at
  creation — table size is a real-time operational setting, not something that
  needs to stay fixed for money-integrity reasons). A host who ends up running
  10-11 handed just bumps the number; nothing about the buy-in or settlement math
  cares what it's set to.
- **[decision] `Active seated` is derived, not stored** — the count of currently
  confirmed players who haven't cashed out yet. This is the number compared
  against table size, not "everyone who's ever joined tonight" — someone who
  cashed out and left no longer counts toward capacity, which is exactly how a
  freed seat becomes available again with zero extra host action.
- **[decision] Table status is auto-computed — `full` once active seated ≥ table
  size, `open` otherwise — but the host can force an override either direction.**
  A host might want to signal "full" early (an 8th seat that's spoken for but not
  yet confirmed) or keep it "open" past the nominal size (happy to squeeze in an
  11th). The override is a simple toggle, not a separate workflow.
- **[decision] "Full" changes framing on the Shared table / RSVP link — it never
  blocks a request.** Past capacity, the pre-join screen's copy shifts from a
  plain "Join this game" to something like "Table's full (9/9) — request anyway if
  you're replacing someone or want to wait for a seat." The request still goes
  into the host's pending queue exactly as before. **This is a deliberate
  consistency call**: host-confirm is already the one real gate on every buy-in in
  this system; adding a second, automated gate here would be the one exception to
  that pattern, and it would actively work against the exact scenario this section
  exists for — a stale headcount blocking a legitimate replacement request the
  instant a seat actually opens.
- **A brand-new walk-in mid-game needs no new mechanism** — it's the same
  self-join request flow that already exists, whether the table reads as full or
  not. The only thing that changes is the copy on the pre-join screen.
- **[decision] Replacing a player is two existing actions, given a shortcut, not a
  new mechanism.** Cashing out the leaving player already frees the seat (table
  status flips back to `open` automatically). What's missing is a fast path from
  that moment to seating the next person:
  - If someone's already sitting in the pending queue, the host gets a direct
    prompt right after cashing the old player out: confirm the waiting request
    without hunting for it.
  - **[decision, a deliberate, narrow exception to "host never types a player
    in"]** If the replacement isn't using the app — no phone in hand, not tech-
    inclined, whatever the reason — the host can add them directly: name, phone,
    buy-in count, the same fields self-join would have collected. **This still
    creates a real request object that the host immediately confirms**, rather
    than silently inserting a player with no record of how they got there — the
    audit trail self-join was built to guarantee stays intact even when the host
    is the one who typed the name in. This exception is scoped tightly to the
    replace-a-seat moment (and available as a low-visibility fallback elsewhere on
    Live Game for the rare fully-offline walk-in) — it does not reopen general
    host-side roster management, which stays fully self-join by default.

## Live-capture experience

*(New section.)* The host currently runs this game almost daily on a paper tally
sheet, and digitizes it afterward. That "digitize later" step is the thing this app
should eliminate — not by scanning the paper better, but by being faster than the pen
at the moment of capture, while preserving the one thing paper does that an app on a
single person's phone doesn't: everyone at the table can see it.

- **Shared table / RSVP link — one link, four states over the game's life.** Starting
  a game generates a public, unauthenticated link/QR. What it shows depends on the
  game's status and, once someone's joined, their own device identity:
  - **[decision, new] Scheduled, not yet started:** a short summary (game name,
    venue, date/time, host, stake) with no Join action and copy stating when it
    starts — per the new `scheduled` status under Game lifecycle. Nothing about
    joining or buy-ins is possible here.
  - **Before joining, live game:** the same short summary, now with the **live
    seat count** ("7/9 seated") and a **Join this game** action — which opens the
    buy-in count picker (see Money model), not an instant join. **[decision] Once
    the table reads `full`, the action's framing changes** (see Table capacity &
    seat turnover) but the request still submits exactly the same way — this is
    never a hard block. No player list is needed here yet.
  - **After joining, live game:** **[decision, revised — pulls back the earlier
    "communal reconciliation strip"]** a list of the other players **by name only,
    ordered by buy-in count** (most buy-ins first) — no aggregate totals, no total
    buy-ins/cashed-out/still-in-play figure, and no other player's exact number.
    A joined player sees **their own buy-in count and nothing else numeric**. This
    is a deliberate reversal from the earlier design, which showed everyone's exact
    counts and a live reconciliation strip to replicate the paper sheet's full
    transparency — that thesis is intentionally dialed back here in favor of less
    exposure if the link travels further than intended. Rake was never shown here
    and still isn't.
  - **After close:** the same link now shows basic game data plus **only this
    viewer's own settlement line** (who they owe or are owed, amount, status) — see
    Settlement, below. It stops accepting joins and stops showing any live-table
    content the moment the game closes.
  - This carries the same known gap as before — a leaked link lets anyone add
    themselves as a real participant — but the request/confirm join flow above
    softens the *money* consequence of that gap even though the *identity* exposure
    is unchanged: a stranger can still see themselves added, but they can't credit
    themselves a buy-in the host never actually received.
- **Live capture is tap-only, and every buy-in/cash-out action routes through one
  bottom sheet.** **[decision, revised] Voice entry is removed** — it added
  transcription-accuracy risk (names, background noise) without a clear enough win
  over tapping to justify it. **[decision] There is exactly one surface for adding
  a buy-in or cash-out: the bottom sheet.** This applies whether the host is adding
  to an existing player directly (auto-confirmed) or reviewing a pending request
  (opens the same sheet, pre-filled with the requested count, adjustable before
  confirming) — there's no separate inline "+" anywhere else on Live Game.
  Declining a request is the one exception that doesn't require the sheet, since
  nothing is being added.
- **Photo-of-the-sheet import — a true last resort, not a featured fallback.**
  **[decision, revised]** This stays available for a host who's reverted to paper
  entirely for a night, but it's demoted further than the previous revision: no
  prominent icon alongside the core controls, reached instead through an overflow
  or settings-style entry point. **[decision]** Still requires per-field
  confirmation for anything below a confidence threshold, same as always — nothing
  auto-commits from a scan. If usage data ever shows nobody reaches for this, it's
  a candidate to cut outright rather than keep polishing.
- **Settlement distribution via the same evolving link — WhatsApp Business API
  plan retired.** **[decision, revised]** Rather than the host's app sending
  templated, per-player WhatsApp messages (which needed a WhatsApp Business API
  account, template approval, and per-message cost handling — see the retired
  Known gap), settlement now reaches players through the **same Shared table / RSVP
  link** described above, in its post-close state. The host manually re-shares (or
  the group chat already has) that one link; each viewer sees only their own
  settlement line, recognized by phone. **[decision] The text the host posts is a
  plain confirmation-of-game-details announcement — it never contains anyone's
  settlement figures.** Only the link's personalized content, opened individually,
  carries numbers. **[decision] Payment status per transfer is one of
  `pending`, `confirmed`, or `disputed`**, settable by the viewing player from
  that link. **[decision, revised] A dispute is now a "request a change," and can
  carry an optional proposed amount/note** — still doesn't reopen or recompute
  anything on its own, and the host retains full, standing authority to edit
  regardless, but the host now sees what the player thinks it should be, not just
  that they disagree. **[decision] Settlement is not frozen at close** (see Game
  lifecycle) — the host can keep adjusting who-pays-whom after the fact, and each
  adjustment is reflected the next time the host updates/re-shares the link, and in
  both players' historical stats (My Settlements, lifetime net).

## Player confirmation & history

*(New section.)* Once a player is in a game (via self-join, above), they should be
able to see and confirm their own numbers as they happen, not just find out at
settlement — and that same data should build into a real performance history over
time.

- **[decision] Every buy-in *request* becomes its own timestamped event carrying a
  count**, not a series of increments-of-one. A player's row now looks like a small
  ledger: `9:42pm — requested 3 buy-ins`, `9:43pm — confirmed by host`, rather than a
  bare running number. This is a real schema change to a `buyin_requests` table
  (`player_id`, `game_id`, `count`, `requested_at`, `confirmed_at`, `status`) — a
  request can represent more than one buy-in (see Money model's revised "count is
  chosen, minimum 1" rule), confirmed or declined as a whole unit, not per-buy-in
  within it. It's a net simplification, not just added complexity: the existing
  "locks 1 minute after entry" rule stops needing a separate locked/unlocked flag
  and instead falls straight out of the data — a request is locked once its own
  `confirmed_at` is more than a minute old.
- **[decision, revised] Confirmation now has four states to track per buy-in, not
  three tiers of dispute power** — the request/confirm model changes what "confirm"
  even means at the buy-in stage:
  - **Pending** — the player has requested a buy-in (at join or mid-game); nothing
    is real or counted yet. The player can only wait; there's no player-side cancel
    built (a low priority — declining is cheap for the host to do instead).
  - **Confirmed, unlocked** — the host has accepted it; it now counts, and is
    editable by the host for the next minute.
  - **Confirmed, locked** — more than a minute has passed. **A player's dispute here
    is purely informational** — it cannot reopen a locked buy-in, it just flags it
    for the host to sort out directly.
  - **Declined** — the host rejected the request; it never counted and leaves no
    financial trace, though it can stay visible in the player's own feed as "not
    accepted" for their own clarity.
  - Cash-outs keep the previous, simpler rule: editable until close, so a player's
    dispute there is genuinely actionable, not just a flag.
  - Settlement is no longer a frozen tier at all (see Game lifecycle and the
    rewritten Settlement distribution above) — a player's confirm/dispute on a
    settlement line is a signal to the host, who has standing authority to edit it
    regardless.
- **My Game (live).** A signed-in player's live view of a game they're in extends the
  existing "own numbers only" view with the timestamped feed above and a
  confirm/dispute affordance per entry.
- **My Settlements.** A history screen, across every game a player has been in — not
  just the current one — showing each settlement transfer they were party to and its
  status (`pending`/`confirmed`/`disputed`), plus lifetime totals owed and received.
- **Game-over-game performance and overall statistics** already exist in outline
  under Dashboard / history (net-trend by stake, win count) — this section adds
  Settlements as its own history alongside that, and treats timestamp-driven
  analytics (session length, buy-in pacing through the night) as a deliberate later
  phase: real once enough games' worth of timestamps exist, not something to design
  screens for ahead of having the data.

## Roles inside a game

- The **host** of a game sees everything: every player's buy-ins/cash-outs, the full
  settlement graph, total rake.
- A **player who is not the host** of a game sees only their own buy-in/cash-out/net
  for that game — never anyone else's numbers.
- A host is also a player in their own game (their own buy-ins/cash-out work exactly
  like any other player's).
- **[decision, superseded]** The previous revision's "remove a mistaken join within
  the 1-minute lock window" rule is gone — see "Joining a game," above. A host can
  now decline any pending request at any time before confirming it, with no time
  pressure, since nothing is real until confirmed.
- **Co-hosting is out of scope.** A game has exactly one host. Not a silent gap —
  explicitly not building this yet.

## Dashboard / history

- **[decision] Every value figure on the dashboard displays in chips, primary;
  buy-in counts display in banks, subtle** — net, average pot, rake collected,
  lifetime totals, all of it, per the Money model's Chips decision. A game's
  buy-in count still shows (small, secondary) so a player or host can see activity
  at a glance, but the number that actually answers "how am I doing" is chips.
- There is **no separate History screen**. The Home dashboard covers it via two tabs:
  - **Host tab**: games this account has hosted, hosting stats (games hosted, players
    hosted, rake collected, average pot).
    - **[decision] Definitions:** *players hosted* = total player-slots across all
      hosted games, not deduped by phone (a regular in 10 games counts 10 times —
      this is a hosting-volume stat, not a unique-people stat). *Average pot* = mean
      of `sum(buy-ins)` per game, i.e. money that came into play, not including rake
      and not counting cash-outs.
  - **Player tab**: this account's own results across every game they've played in
    (self-joined, hosted or not), overall net, win count, and a net-trend chart. Since
    self-join means a player's row and account are the same thing from the moment
    they join (see Access model), this reflects every game they've ever joined —
    there's no `claimed` gate anymore.
    - **[decision] Adds a Settlements sub-section**, per Player confirmation &
      history above: every settlement transfer this account has been party to, its
      status, and lifetime totals owed/received.
- The **net-trend chart splits by stake** (the game-level buy-in amount defined
  above) — different stakes aren't comparable on one line, so each distinct stake
  gets its own chart rather than being blended into one misleading combined trend.
- Tapping any game (from either tab) goes to game detail, which applies the
  host/player visibility rule above.

## Venues

*(New section.)* "Location" on Create Game has, until now, been a free-text field
with no identity of its own — two games at the same physical place typed slightly
differently are invisible to each other, and there's no way to answer "how has this
place's game gone over time," since that history isn't scoped to any single host's
account.

- **A venue is a shared, global entity, independent of any single host account.**
  Any approved host can select an existing venue or create a new one at game
  creation; a venue is not owned by the host who first created it, since the whole
  point is that history there should aggregate **regardless of who's hosting** on any
  given night.
- Games link to a `venue_id`. A free-text location string remains available as a
  fallback for a genuine one-off the host doesn't want to save as a venue (e.g. a
  single game played somewhere unusual) — it just won't accumulate any venue history.
- **[decision] Dedup gap, carried forward from the same problem with phone numbers:**
  a venue is only as good as the willingness to reuse it rather than retype it. Two
  hosts typing "Kumar's house" and "Kumar's Place" will create two separate venues.
  The mitigation is the same pattern as player-roster reuse — a typeahead search
  against existing venues before allowing a new one to be created — not fuzzy
  matching after the fact. No automatic merge/dedup of venues is built; if two get
  created for the same real place, they stay separate until someone notices.
- **[decision] Venue-level visibility.** A venue's history is visible to anyone who
  has played a game there at least once (as host or player), and shows: total games
  played, date range, which accounts have hosted there, a "regulars" list ranked by
  attendance frequency, and average pot/rake collected across all games at that
  venue. **It does not expose any individual player's net, win/loss, or a
  cross-host leaderboard at the venue level** — a player's financial history stays
  governed by the existing per-game host/player visibility rule, which still applies
  when someone taps into a specific game from the venue's history and opens its Game
  Detail. This was a deliberate call against the more tempting "who's actually
  winning at Kumar's house, lifetime" leaderboard, because that would surface a
  player's net to hosts and other players they may never have personally played
  against — a bigger privacy step than anything else in the app to date. Revisit only
  with an explicit, opt-in decision from the group, not as a default.
- ⚠️ **Cross-ratio aggregation gap.** Average pot/rake at a venue is now shown in
  chips, but different games at the same venue can be set to different ratios
  (`1:1` vs `1:2`) — averaging chip figures across them treats those numbers as
  equivalent when they represented different real value at the time. Not solved
  here; flagged as a known gap rather than silently averaged.

- **[decision] Hosting a specific game there already grants full detail** for that
  game via the normal Game Detail screen and its host/player visibility rule — a
  host doesn't need anything extra on Venue Detail itself to see their own games in
  full; this section only adds the aggregate, cross-host view on top of that.
- **[decision, new] Venue Detail includes real charts**, not just numbers: a pot
  size trend across recent games at that venue, and an attendance chart for the
  regulars list — both aggregate, both consistent with the no-individual-financials
  rule above (a pot-over-time trend doesn't expose any one player's number).
- **[decision, new] The per-game list splits its columns by the viewer's role in
  that specific game**, not just by tapping through to Game Detail:
  - **A game the viewer hosted:** date, player count, pot/game data, and a
    settlement summary (e.g. "6 transfers, 4 confirmed") shown directly in the row.
  - **A game the viewer only played in:** date, and *only their own* game data and
    settlement outcome for that game — nothing about other players, consistent
    with the same rule everywhere else. This is the venue-level list surfacing what
    Game Detail already enforces, without requiring a tap-through just to see your
    own basic result for a past night.

- **[decision] Confirmed: no new "browse live games" discovery feature.** Multiple
  hosts running games (at the same venue or different ones) is already handled by
  this section's aggregation plus each host's own Home tab — nothing further was
  requested beyond that already working correctly.

## Hosting entities

*(New section — thirteenth revision.)* Every game so far has assumed one
individual host account. That stops holding once a player's actual
relationship is with a **place**, not a person — a club with rotating
dealers, where a player has no reason to ever "add" any one of them as a
trusted host. This section adds a **hosting entity** as a first-class concept:
today, every entity is a `house` (one person, exactly today's model); a
`club` (multiple staff, its own approval flow) is real schema but no
behavior yet — deliberately not built until a house entity has proven out in
production, per this revision's own instruction to "test with house games
first."

- **[decision] `games.host_id` stays the sole authority for every permission
  check in the app** — `is_game_host()`, every RLS policy, every UI role
  branch. Nothing about who can confirm a buy-in, edit rake, or close a game
  changes here. `hosting_entities` is a new, parallel identity layer a game
  *also* points to (`games.hosting_entity_id`), additive only.
- **[decision] A house entity is created lazily**, the same pattern as venue
  find-or-create: the first time an approved host creates a game and doesn't
  have one yet, one is silently provisioned — named `"{their name}'s games"`,
  editable after the fact from their Home Host tab. No setup step, no new
  thing for an existing host to learn.
- **[decision] The first real feature riding on this layer: a permanent
  link.** Unlike a game's `/t/:gameId` link — reminted every single night —
  a hosting entity has one link (`/e/:slug`) that never changes: printed
  once, always resolves to whichever game is live or scheduled for that
  entity right now, with no active game showing a plain "check back" state
  that resolves itself the moment one starts (same realtime-driven pattern
  as Scheduled Game's own fix). This is the one thing a *house* entity
  can't actually make much use of yet (a solo host still reprints a QR
  rarely) but a club obviously needs on day one — proving it on house games
  first means the schema and the page are already validated before a club's
  multi-staff roster is the thing being tested.
- **[decision] Every existing game was backfilled onto an auto-created house
  entity** for its existing host, one entity per distinct host, at migration
  time (`0008_hosting_entities.sql`) — no game is left pointing at nothing.
- **Known gap, deliberately deferred**: no `hosting_entity_staff` table yet —
  a club's multi-person roster, its own owner/dealer permission tiers, and
  the "app-admin approves the club once, the club manages its own staff
  after that" approval flow are real, designed (see the Club Pro discussion
  this revision followed from), and explicitly not built until a house
  entity has been live for a while. Monetization (a paid Club Pro tier) is
  the same story — designed, not gated into the code anywhere yet.

## Invites (superseded by self-join — see Access model)

- Retired along with the WhatsApp Business API plan (see Live-capture experience) —
  the same Shared table / RSVP link now covers announcing, joining, and settlement.
  A host still typically pastes that link into a group chat to announce a game, but
  there's no separate "invite" artifact or text block being generated anymore.

## Known gaps — intentionally deferred, not silently missing

- **Self-join still has no identity verification, even with host-confirm.** A typed
  name + phone number is still not proven to belong to the person typing it — the
  fifth revision's host-confirm requirement fixes the *money* consequence of this
  (nothing counts until the host confirms), but the *identity* is exactly as
  unverified as before. Real verification would still need phone-OTP-per-join,
  blocked the same way host OTP is.
- **Device-remembered join session is not a real authenticated account.** The
  one-tap "Continue as {name}" relies on a lightweight local session — anyone with
  physical access to that device while it's remembered can request to join future
  games as that person (though the host still has to confirm before anything counts).
  No expiry or re-confirmation is built yet.
- **Contacts picker**: the "Contacts" tab that previously lived on Create Game is
  removed along with the rest of host-side player entry (see Access model) — this
  gap is now closed by not needing the feature at all, rather than by building it.
- **Photo-of-the-sheet import**: not yet built — now explicitly a last-resort
  fallback (see Live-capture experience), lower priority than previously stated.
- **Venue merge/dedup**: if the same real place ends up saved as two or more
  separate venues (typo, different host typed it differently), there's no
  merge/reassignment tool yet — their histories stay split until manually noticed.
- **Phone OTP auth**: configured (Twilio Verify credentials are set) but blocked by
  Twilio trial-account number-verification limits. Currently using email magic-link
  for the host track; the player track never used OTP in the first place (see Access
  model) and doesn't need this fixed to work as designed — it's more relevant to
  eventually tightening the self-join verification gap above.
- **Phone number reuse**: if a phone number is reassigned to a different real person
  over time, self-join (or the old claim-by-phone flow) can attach a stranger's past
  games to the new owner. No detection/resolution built for this yet.
- **Name collisions within one game**: two different people both typing the same
  first name when they join (phone number still keeps them distinct underneath) has
  no disambiguation in the UI yet — both would just show up as the same displayed
  name.
- **Settlement edits have no audit trail or change notification.** Since settlement
  is now indefinitely host-editable (see Game lifecycle), a player has no way to see
  *what* changed if the host adjusts a transfer after they last checked — only the
  current state, via the link. No history log or "this was updated" notice is built.
- **No live database on game screens**: game screens (buy-ins, cash-out, settlement)
  currently run on local React state only, not wired to Supabase — meaning there is
  currently **no server-side access control (RLS)** actually enforcing the
  host/player visibility rules described above. Names and phone numbers are real PII
  even in a play-money app; this should be closed before any real usage, not treated
  as cosmetic.

## Theme

**[decision, revised] Replaces the light Mercury-sourced fintech look** with a
dark analytics-dashboard look, sourced from `DESIGN-dashboard.md` (now the token
source of truth; update that file first if the visual language changes again,
then sync here). The Mercury-era light theme was a legitimate fintech reference
but read as a form; this revision moves the source reference to a dark-mode
sales/ops dashboard instead, where a number rendering loud and monospace *is*
the whole interface — the same thing a player wants the instant they open this
app ("what's my net").

- **Canvas is near-black navy, always — still no dark mode.** This isn't a
  `prefers-color-scheme` toggle; it's the same "exactly one permanent canvas"
  rule as both retired themes, just pointed dark this time. Cards render on a
  lighter navy (`#141a26`) than the near-black page floor (`#0a0e17`) — depth
  comes from that surface-color scale, not a border or shadow.
- **One accent color, vivid orange (`#ff7a29`)**, replacing Mercury-era indigo.
  Carries every primary CTA, the active segmented-tab state, and the live-game
  "in progress" dot — same one-accent restraint as both retired themes, just
  brighter, to suit a screen glanced at mid-hand rather than read at a desk.
- **Text**: ink (`#f5f6f8`, near-white — never pure white) for headlines and
  hero figures, body (`#c7ccd6`) for running text, muted (`#8a92a3`) for labels
  and captions.
- **Every number is monospace, not just tabular.** The Mercury-era theme applied
  `tabular-nums` to money figures; this one goes further and sets them in the
  system monospace stack (Tailwind's `font-mono`) everywhere they appear — buy-in
  counts, per-player net, settlement amounts, the one hero figure a screen exists
  to show. A new shared `StatCard` component (eyebrow label + monospace hero
  figure + optional colored delta line) carries this pattern consistently on
  Home, My Game, and Game Detail.
- **Stadium-shaped segmented controls, used only where a real switch already
  existed.** A new shared `SegmentedControl` component (filled orange on the
  active option) replaced five different ad hoc toggle-button implementations
  that already existed in the product — Home's Player/Host split, Live Game's
  rake masked/revealed and table status auto/open/full, and Create Game's chip
  ratio and schedule-mode choices. Nothing was added that wasn't already a real
  either/or state; the visual pattern was only ever meant to replace existing
  ad hoc toggles, never to invent decorative ones.
- **No shadow tier at all.** Both retired themes kept one shadow tier for
  floating surfaces; a dark shadow barely shows against a near-black canvas, so
  this theme relies entirely on the canvas/surface-color scale for depth, plus a
  hairline ring (not a shadow) on the one or two surfaces that still need a
  visible edge (the confirm dialog, a toast). The modal scrim darkened from 50%
  to 70% black to compensate for the darker canvas underneath it needing more
  contrast to still read as "dimmed."
- **Shape**: 10px radius on inputs/small buttons, 20px on cards, full pill only
  on segmented controls, status pills, and avatars — a wider gap between "card"
  and "pill" than either retired theme had.
- **Type**: stays **Inter** for every label and headline — it was already both
  retired themes' choice and is also the de facto typeface of the dashboard
  genre itself, so no font change was needed there; the monospace stack above is
  additive, for numbers only.
- **[decision] Win/loss color stays a deliberate, minimal extension** — no
  source system documents one — with brighter, minter tones (`#34d399` win,
  `#f75466` error) than either retired theme's, to stay legible against
  near-black rather than white or light gray.

## Stack

- React + Vite + Tailwind v4 (CSS-first config, no `tailwind.config.js`)
- shadcn/ui (Base UI primitives) is the standard component library going forward —
  new UI work should reach for a shadcn component (`pnpm dlx shadcn@latest add <name>`)
  before hand-rolling one. Existing hand-rolled components in `src/components/ui/`
  (`Button`, `StatCard`, etc.) are migrated over individually, not all at once — see
  `PAGE_INVENTORY.md` for the current inventory of what's hand-rolled vs shadcn.
  Note: components land case-sensitively in the same `src/components/ui/` folder as
  the existing ones — check for a name collision (e.g. `Button` vs `button`, `Spinner`
  vs `spinner`) before adding one that shares a name with something hand-rolled.
- Supabase: Postgres + Auth + RLS (schema in `supabase/schema.sql`) — **note: the game
  screens are currently still on local React state, not wired to live Supabase data.**
  Only auth/profiles/admin-approval actually hit the database right now. See "No live
  database on game screens" under Known gaps.
- PWA via `vite-plugin-pwa`
- Deployed on Vercel, repo at `github.com/LaksUX/Stradde-Pro`
- `DESIGN-airbnb.md` (repo root) is the token source of truth for Theme, above —
  update it first if the visual language changes again, then sync this file.
