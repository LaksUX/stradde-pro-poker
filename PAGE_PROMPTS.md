# Poker Night — Page-Level Prompts

One section per screen. Each is written as a self-contained spec you can hand back to
Claude when asking for a change — "update the Live Game section below, then implement
it" is enough context for a correct edit, without re-explaining the whole app.

Keep these in sync with reality: when a screen changes, update its section here in the
same request. If `REQUIREMENTS.md` and a page prompt ever disagree, `REQUIREMENTS.md`
wins — page prompts are the "how," requirements are the "what and why."

> **Revision note:** Synced against the updated `REQUIREMENTS.md` (game lifecycle,
> stake field, claim-by-phone identity, edit/lock windows, deterministic settlement).
> Also switches theming to shadcn/ui and adds an **Edge cases** subsection to every
> screen that had gaps — flagged with ⚠️ where the requirement doc doesn't yet dictate
> an answer and one is proposed here for you to confirm.
>
> **Second revision note:** Adds the **live-capture experience** from
> `REQUIREMENTS.md` — a new public **Share Table** screen, voice-assisted entry and a
> photo-import fallback on Live Game, and WhatsApp Confirm/Dispute distribution on
> Settlement. The goal across all of these: beat the host's paper sheet at the moment
> of capture, and let everyone at the table watch it happen, rather than digitizing
> the sheet afterward.
>
> **Third revision note:** Adds a venue picker to Create Game and a new **Venue
> Detail** screen — a physical place's history, shared across whoever hosts there.
>
> **Fourth revision note:** Replaces host-entered players with **self-join**.
> Create Game drops the entire player-entry step; Share Table gains a **Join this
> game** action (name + phone, or a remembered one-tap rejoin); Login/Complete
> Profile now only apply to the host track. Live Game and the player-facing screens
> gain a timestamped buy-in feed with per-entry confirm/dispute, and two new screens
> — **My Game** and **My Settlements** — round out the player side.
>
> **Fifth revision note:** Joining now creates a **pending buy-in request** the host
> confirms or declines, not an instant grant — Live Game gains a **Pending requests**
> queue. Share Table is pulled back to names-only, ranked by buy-in count, with no
> aggregate numbers visible to players. Voice entry is removed outright; photo
> import moves to a low-visibility, last-resort entry point. Settlement gains free
> who-pays-whom reassignment and an explicit **Update shared link** action, since
> settlement is no longer frozen after close — it's distributed and re-distributed
> through the same evolving Share Table / RSVP link rather than WhatsApp messages.
> Create Game also gains an editable date/time field and pulls every field from the
> host's last game by default.
>
> **Sixth revision note:** Create Game adds a real **scheduled vs. live** choice
> (a future date/time now genuinely gates joining and buy-ins), an off-by-default
> **chip ratio** display toggle, and an **invite-only** toggle. Buy-in requests
> (join or mid-game) now carry a **chosen count, minimum 1**, via one shared
> slider+stepper component used identically by hosts and players. Every buy-in and
> cash-out action — including confirming a pending request — routes through the
> bottom sheet, with no other entry point. Settlement's Dispute becomes **Request
> change**, which can carry a proposed amount. Venue Detail gains real charts and
> splits its per-game columns by the viewer's role in each game.
>
> **Seventh revision note:** Retires "Casino felt" for a warm, white-canvas theme
> sourced from `DESIGN-airbnb.md` — see the rewritten Theming section. Visual only;
> no screen's behavior or content changes in this pass, only its color, type, and
> shape tokens.
>
> **Eighth revision note:** Chip ratio simplified to a plain `1:1` / `1:2` switch.
> **Invite-only is removed entirely** — see `REQUIREMENTS.md` for why (it doubled
> up on a trust problem host-confirm already solved, without earning its
> complexity). Also adds a dedicated, standalone **player-journey prototype** for
> review before further build planning — see the file itself; nothing here in
> `PAGE_PROMPTS.md` changes shape yet, since that review may still reshape My Game
> / My Settlements / Home's Player tab into a more unified hub.
>
> **Ninth revision note — corrects the previous revision.** Chip ratio wasn't
> cosmetic after all: it's a real, always-set field (default `1:1`) that
> determines a bank's actual settlement value, and **chips** — not banks — is now
> the primary figure shown wherever a value appears, for hosts and players alike.
> Banks become the subtle, secondary buy-in count everywhere they used to be the
> headline number. Every screen below that shows a value has been updated
> accordingly: Create Game, Live Game's stats row, Settlement, Share Table, My
> Game, My Settlements, Home's Player tab, and Venue Detail.
>
> **Tenth revision note.** Create Game gains **Table size** (default 9,
> live-editable). Live Game gains a **table status indicator** (auto-computed
> full/open, host-overridable) and a **Replace this seat** shortcut that appears
> right after a cash-out. Share Table's pre-join state now shows the live seat
> count and reframes its copy once full — the request itself never gets blocked.

---

## Theming — shadcn/ui, remapped to `DESIGN-airbnb.md`

**[decision, revised] Replaces the felt/gold token mapping entirely.** Component
layer stays **shadcn/ui** (Radix primitives + Tailwind v4) — only the tokens change,
sourced from `DESIGN-airbnb.md` kept alongside this file.

- CSS-first `@theme` block in `src/index.css` now carries the source system's
  tokens instead of felt/gold: `--color-canvas` (#ffffff), `--color-ink` (#222222),
  `--color-body` (#3f3f3f), `--color-muted` (#6a6a6a), `--color-hairline`
  (#dddddd), `--color-surface-soft` (#f7f7f7), `--color-surface-strong` (#f2f2f2),
  `--color-primary` / Rausch (#ff385c), `--color-primary-active` (#e00b41),
  `--color-primary-disabled` (#ffd1da), `--color-error` (#c13515), plus the two
  minimal extensions the source system doesn't define: a plain low-key green for a
  positive net and the system's own error red for a negative one (see
  `REQUIREMENTS.md`).
- Radius tokens: `--radius-sm` 8px (buttons), `--radius-md` 14px (cards, sheets),
  `--radius-full` 9999px (pills, badges, the share-link surface) — no hard corners
  on any interactive element, per the source system.
- Spacing tokens follow the source system's 4px-base scale: 8 / 12 / 16 / 24 / 32 /
  48 / 64px, used consistently for padding and gaps rather than ad hoc values.
- Elevation: flat by default everywhere; the **one** documented shadow tier
  (`0 0 0 1px rgba(0,0,0,.02), 0 2px 6px rgba(0,0,0,.04), 0 4px 8px rgba(0,0,0,.1)`)
  applies only to the bottom sheet/modal surface and floating badges — never as a
  general card treatment.
- Type: **Inter**, per `DESIGN-airbnb.md`'s own documented substitute for Cereal/
  Circular. Carries the source scale — modest display weights (20–28px, 500–700),
  16px/400 body, small/medium-weight captions and badges.
- Remap shadcn's standard CSS variables to these rather than its defaults:
  - `--background` → `--color-canvas`
  - `--card` → `--color-canvas` (cards are white-on-white, separated by a 1px
    hairline or the single shadow tier — not a darker fill)
  - `--popover` (bottom sheets, dropdowns) → `--color-canvas` with the shadow tier
  - `--border` / `--input` → `--color-hairline`
  - `--primary` / `--ring` → `--color-primary` (Rausch)
  - `--primary-foreground` → white (`--color-on-primary`)
  - `--destructive` → `--color-error`
- No `tailwind.config.js` — shadcn v4 install stays CLI-driven, unchanged.
- Use shadcn primitives for the components that already imply their shape:
  `Sheet` (bottom sheets on Live Game / Settlement edit), `Toggle`/`Switch` (cash-out
  toggle), `Slider` (buy-in count picker), `Dialog` (Admin approve/revoke
  confirmation, modal scrim), `Tabs` (Host/Player toggle on Home) — don't hand-roll
  these.
- ⚠️ **Edge case — light-mode-only app, reversed from before.** The felt theme was
  permanently dark; this one is permanently light — Airbnb's public web has no dark
  mode at all, per `DESIGN-airbnb.md`. Skip shadcn's dark variables entirely (or
  never apply the `dark` class) so a device's `prefers-color-scheme: dark` can't
  leak a dark rendering the design has no answer for.

---

## Login *(host track only)*

Email magic-link. Enter email → "Send magic link" → "check your email" confirmation
state with a way to go back and use a different email. White-canvas theme, centered
card, ♠ mark. (Swap target: phone OTP via Twilio Verify, once unblocked — see
`REQUIREMENTS.md` auth section.) **Players never see this screen** — joining a game
happens entirely through the Join flow below, per `REQUIREMENTS.md`'s two-track
identity model. Someone only lands here if they're trying to become a host.

### Edge cases
- ⚠️ **Magic link opened on a different device/browser than it was requested on**
  (e.g. link sent to phone's mail app, opened there, but the person had the tab open
  on desktop) — the desktop tab should detect the new session on refresh/focus rather
  than being stuck on "check your email" forever.
- ⚠️ **Expired or already-used link** — needs its own state, not a generic error:
  "This link has expired — send a new one," with the same email prefilled.

## Join *(new — replaces Complete Profile; this is the entire player track)*

Reached only from a Share Table link/QR, by tapping **Join this game**. This is the
whole of a player's "sign up" — there is no separate account creation, no email, no
password, per `REQUIREMENTS.md`.

- **Device already joined before (this or any game):** a single "Continue as
  {name}" button. If that identity isn't yet confirmed into *this* game, tapping it
  opens the **buy-in count picker** (slider + stepper + quick-pick chips for 1/2/3/5,
  minimum 1) before submitting a pending request; if already confirmed, it goes
  straight to My Game. A quieter "Not you? Switch" link sits underneath, always
  visible, never hidden behind a menu.
- **New device or first time:** name and phone, then the same buy-in count picker,
  then **Request to join**. No format friction beyond a phone hint — no OTP, no
  confirmation step. Submitting normalizes the phone to E.164 and **creates a
  pending request for the chosen count** — not an instant grant, per
  `REQUIREMENTS.md`'s revised money-integrity rule. The screen that follows says
  plainly that the host still needs to confirm before it's real.
- **Phone matches an existing identity** (same person, new device): recognized
  silently by the phone number — no "is this you?" prompt needed, no separate claim
  step. Their history and stats are already theirs.
- No password, no verification code anywhere in this screen — deliberately, per
  `REQUIREMENTS.md`'s accepted trade-off for zero friction. Copy on this screen
  should say plainly what's happening ("Anyone with this link can request to join;
  the host confirms before anything counts") rather than implying more security or
  more automatic entry than the flow actually has.

### Edge cases
- ⚠️ **Joining a game that already ended** — if the Share Table link resolves to a
  closed game (see Share Table below), Join shouldn't even render; show the "this
  game has ended" state instead.
- ⚠️ **Two different people type the same first name** — still distinct underneath
  (phone is the real key), but the UI has no disambiguation yet; at minimum, don't
  let it look like a duplicate join was silently merged into one person.
- ⚠️ **Someone taps Join twice in a row** (double-tap, or backing out and retrying)
  — must not create two pending requests; treat a repeat submission with the same
  phone within the same game as "you already have a request in, waiting on the
  host," not a second request.
- **Waiting-for-host state with no clear end** — if the host is slow to check
  pending requests, the waiting screen shouldn't feel broken; a short reassurance
  ("The host will confirm shortly") beats a bare spinner.
- **Shared/borrowed device with a remembered "Continue as" that isn't actually the
  current holder** — the always-visible "Not you? Switch" is the only mitigation;
  there's no way to force a re-check, by design, since that would reintroduce the
  friction this screen exists to remove.

## Pending Approval *(host track only)*

Shown to any signed-in account that isn't an approved host or admin. States plainly
that their account exists and they need an admin to approve them as a host. Includes
logout.

### Edge cases
- ⚠️ Someone who only ever wants to play, never host, should never end up here at
  all now — there's no login step in the player track that could route them here.
  This screen is purely a host-track waypoint.

## Admin (hidden, admin-only)

Lists every non-admin profile with name/phone, current role/approved status. Per-row
"Approve as host" / "Revoke approval" actions, writing directly to `profiles.role` /
`profiles.approved`. Reachable only for `role === "admin"` accounts, via a small entry
point on Home.

### Edge cases
- ⚠️ **Revoking a host who has live (unclosed) games.** `REQUIREMENTS.md` flags this
  as an open question — until it's answered, "Revoke approval" should show a
  confirmation dialog naming any of that host's games that are still `live`, so the
  admin isn't revoking blind. Doesn't need to *block* revocation, just surface it.

## Home

**Reachable two ways now, matching the two identity tracks:** a host arrives via
Login (email session, admin-approved); a player arrives via their device's
remembered join identity from the Join screen — there's no email or password on
that path at all, per `REQUIREMENTS.md`. A device with no session of either kind
lands on Home in a signed-out state: just the "New Game" CTA (which routes to Login,
since starting a game requires the host track) and nothing else — no Host/Player
tabs, no stats, nothing that implies data exists for a nobody-yet identity.

Header: greeting + name, admin-only entry point to Admin screen, logout (for whichever
track got them there).

Below that: Live Game card if one's active, "New Game" CTA, then a **Host / Player**
segmented toggle (shadcn `Tabs`) — the Host tab only renders content if this identity
has host approval; a phone-only player identity simply doesn't have a Host tab worth
showing (not an error state, just not applicable). **[decision] Every value figure
in both tabs — net, rake collected, average pot, lifetime totals — displays in
chips, primary; buy-in counts stay subtle, in banks**, per `REQUIREMENTS.md`.

- **Host tab**: hosting-stats grid (games hosted, players hosted, rake collected, avg
  pot/game) + list of recently hosted games. Stats and list reflect **closed games
  only** — a game in progress doesn't count toward totals yet (see
  `REQUIREMENTS.md` → Game lifecycle).
- **Player tab**: overall net + win count summary card, then the **net-trend chart
  split by stake** (one chart per distinct buy-in amount, never blended), then a
  **Settlements** section (every transfer this identity has been party to, status
  and lifetime totals — see My Settlements below), then a list of games played with
  personal net per game. Reflects every game this phone identity has ever joined —
  there's no `claimed` gate anymore, per `REQUIREMENTS.md`.

Tapping any game in either list goes to Game Detail.

No separate History screen/tab — this covers it.

### Edge cases
- ⚠️ **A live game the viewer is hosting AND playing in** — only one Live Game card
  should show, not two; the "active game" state is per-identity, not per-role.
- **Host tab, zero closed games but one live game in progress** — stats grid should
  read as genuinely zero (not loading/error), with the live game visible via its own
  card above, so the host doesn't think their in-progress game's numbers are missing.
- ⚠️ **Player tab, zero games joined** — a genuinely new phone identity; the empty
  state should point at "join a game via a shared link" rather than anything
  resembling a sign-up flow, since there isn't one.

## Create Game *(host track — dramatically simplified by self-join)*

**No player-entry step at all anymore.** The host sets a few things and shares a
link — that's the entire screen. **[decision] Every field auto-populates from the
host's most recent game**, not just name and venue — stake carries forward too —
since a daily host's setup rarely changes night to night; the point is confirming
defaults, not filling a blank form.

- Game name, venue, **stake**, and **chip ratio** all prefill from the host's last
  game (still freely editable). Venue is a typeahead picker over saved venues, per
  `REQUIREMENTS.md` — selecting an existing venue is what makes that place's history
  accumulate; a "not listed, type a one-off location" option remains for a genuine
  one-time place that won't be saved as a venue.
- **[decision] Date and time are explicit, editable fields**, defaulting to right
  now. **[decision, revised] The CTA reflects intent, not just validation:**
  leaving date/time at its "now" default shows **"Start game & share"** (creates
  the game `live` immediately); editing it to anything else — later today,
  tomorrow, next week — switches the button to **"Schedule game"** (creates it
  `scheduled`, per `REQUIREMENTS.md`). This is a genuine behavior difference now,
  not a cosmetic one: a scheduled game accepts no joins or buy-ins until started.
- **[decision, revised — corrects the previous revision] Chip ratio is a real,
  always-set field, not a hidden Advanced toggle.** A compact `1:1` / `1:2`
  segmented switch sits right next to stake, defaulting to `1:1`. An inline label
  always states the literal conversion ("1 bank = 1 chip" / "1 bank = 2 chips") so
  it's self-explanatory regardless of which option is picked. **Locked once the
  game is created**, same as stake — per `REQUIREMENTS.md`, changing it later
  would retroactively change the value of already-confirmed buy-ins.
- **[decision, new] Table size** — a number field, defaulting to **9**, sitting
  near stake. **Unlike stake and chip ratio, this stays editable throughout the
  live game** (see Live Game below) — it's an operational setting, not something
  that needs to lock for money-integrity reasons.
- **"Start Game" / "Schedule Game" is enabled as soon as name, venue, stake,
  date/time, and table size are all set** — no player count gate — the roster
  starts empty and fills in via self-join requests once the game is `live`.
- After creating a **live** game: the host lands on **Share Table**, join link/QR
  front and center. After creating a **scheduled** game: the host lands on a
  lightweight pre-start screen (see Game lifecycle) with the same link available to
  share ahead of time, but showing "not started yet" to anyone who opens it.

### Edge cases
- ⚠️ **Autofilled fields the host wants to change** — every prefilled field should
  be trivially clearable (not just editable character-by-character), e.g. a small
  "clear" affordance, since the whole point is fast confirmation, not fast retyping.
- **Stake field entered as 0 or blank** — treat as unset, not "free buy-ins"; keep
  "Start Game" disabled rather than silently allowing a zero-stake game.
- ⚠️ **Venue typeahead near-miss** (host starts typing "Kumar" and an existing
  "Kumar's house" venue exists) — surface the match prominently before letting the
  host fall through to "type a one-off location," since a missed match is exactly
  how venue history gets fragmented (see `REQUIREMENTS.md` dedup gap).
- **A game with zero players ever joining** — genuinely possible now (link never
  got shared, or nobody scanned it). "End Game & Settle" should just be disabled
  with plain copy ("No players have joined yet") rather than presenting an empty
  settlement.
- ⚠️ **Host nudges the date/time picker without meaning to** (e.g. taps the field,
  backs out) and accidentally flips "Start" to "Schedule" — the CTA swap should be
  based on a genuine change in value, not merely the field being touched/focused.

## Scheduled Game *(new — the host's pre-start waypoint)*

Reached after creating a `scheduled` game, or by tapping a scheduled-game card on
Home. A deliberately sparse screen — there's nothing to manage yet.

- Summary of what was set: name, venue, date/time, stake. All editable from here,
  since nothing has started.
- The Share Table link/QR, available to send ahead of time — anyone who opens it
  sees the "not started yet" state (see Share Table).
- One primary action: **"Start Game"** — flips the game to `live` and moves the
  host straight into the normal Live Game screen. This is the only way a
  `scheduled` game becomes `live`; there's no automatic transition at the stated
  time.

### Edge cases
- ⚠️ **Host starts the game well before or after the stated time** — fully
  allowed; the stated date/time is what the host planned, not an enforced
  schedule. No warning needed either way.
- **Host wants to cancel a scheduled game entirely** — not covered yet; worth a
  simple delete/cancel action here even if minimal, so an accidentally-created or
  no-longer-happening game doesn't just sit stale on Home indefinitely.

## Share Table / RSVP link *(the live-capture experience's core screen — one link, four states)*

**Public, unauthenticated by default.** No login wall, no app install required —
reachable by anyone with the link or QR generated at game creation, per
`REQUIREMENTS.md`. What renders depends on the game's status and, once joined, the
viewer's own recognized phone identity.

**State 0 — scheduled, not yet started:**
- Game summary: name, venue, date/time, host, stake. No Join action at all — copy
  states plainly when it starts ("Starts Sat 7:00 PM — the host hasn't opened this
  game yet").

**State 1 — before joining, game live:**
- Game summary: name, venue, date/time, host, stake, and the **live seat count**
  ("7/9 seated"). No player list needed yet — headcount only, not names.
- **[decision] Past capacity, this becomes "Table full (9/9)"** and the button's
  surrounding copy shifts to something like "Request anyway if you're replacing
  someone or want to wait for a seat" — **the button itself still submits the
  same request**, per `REQUIREMENTS.md`. This is framing, never a block.
- A prominent **"Join this game"** (or, once full, the reframed variant above)
  button → opens the **buy-in count picker** (slider + stepper, minimum 1 — the
  same component used everywhere buy-ins are chosen, see Live Game), then
  submits. Submitting here creates a pending request for that count, per
  `REQUIREMENTS.md` — this screen should say so, not imply instant entry.

**State 2 — after joining (request confirmed), game live:**
- **[decision, revised — pulls back the earlier "everyone sees everything" design]**
  A list of other players **by name only, ordered by buy-in count** (most first) —
  no numbers next to their names, no total buy-ins/cashed-out/still-in-play figure
  anywhere on this screen. Rake was never shown here and still isn't.
- **The viewer's own buy-in count is the only number on the whole screen**, shown
  clearly next to their own name in the list.
- A **"Request more buy-ins"** action for the viewer's own row — opens the same
  count picker, submits a pending request; shows a small "waiting on host" state
  until confirmed or declined.
- A link to My Game for anyone who wants their own timestamped history rather than
  just this ranked list.

**State 3 — after close:**
- Game summary (name, venue, date/time, final status) plus **only this viewer's own
  settlement line** — who they owe or are owed, how much, and its status
  (`pending`/`confirmed`/`disputed`), with **Confirm** / **Request change**
  actions — the latter can include an optional proposed amount, per
  `REQUIREMENTS.md`. No other player's settlement appears here. **[decision] The
  amount displays in chips** — the settlement value unit, not the raw bank
  buy-in count this same screen showed in State 2.
- **This is also how settlement reaches non-app players now** — the host shares (or
  re-shares) this same link after adjusting settlement, per `REQUIREMENTS.md`; there
  is no separate WhatsApp Business API message flow anymore.
- No more joining, no more live-table content, once the game is closed.

### Edge cases
- ⚠️ **Link opened after the game already closed** — must show State 3 immediately,
  never a stale State 2 snapshot, and the Join button must not render at all.
- ⚠️ **Viewer whose request is still pending** — State 2's player list and "your buy-
  in count" shouldn't render for them yet, since they don't have a confirmed count;
  show the same "waiting on host" state the Join screen uses instead.
- **Very large player counts on a small screen** — the ranked name list should
  scroll within the screen, not grow the page unbounded.
- **Slow/lost connection on a viewer's phone** — show a subtle "reconnecting" state
  rather than silently freezing on stale content.
- ⚠️ **A settlement viewer with no phone match** (link forwarded to someone who
  never played) — State 3 should show a neutral "you weren't in this game" rather
  than a blank or broken personal-settlement section.
- **Host updates settlement after a player already viewed it** — the link always
  shows the current state on next open; there's no notification that it changed
  (see the known gap in `REQUIREMENTS.md`), so don't imply one in the UI either.

## My Game *(new — a signed-in player's own live view)*

Reached from Join (once confirmed) or by returning to an active game a player is
already in. This is the personal counterpart to the host's Live Game and the shared
table's ranked list — it only ever shows this one player's own numbers, per the
existing host/player visibility rule.

- A **timestamped feed** of this player's own entries, newest first: `9:42pm —
  buy-in requested`, `9:43pm — confirmed by host`, and a final `11:50pm — cashed out
  for 38 banks` once that happens. **[decision, revised]** Each buy-in now carries a
  real status, per `REQUIREMENTS.md`: `pending` (waiting on the host — no
  confirm/dispute actions yet, just a wait state), `confirmed` (host accepted it —
  now the usual confirm/dispute pair applies), or `declined` (host rejected it —
  shown plainly so the player isn't left wondering where a buy-in went, but it never
  counted toward anything).
- A **"Request more buy-ins"** button, matching the Share Table's State 2 action —
  opens the buy-in count picker and submits a new pending request without leaving
  this screen.
- **Each confirmed entry carries a confirm/dispute affordance**, tiered exactly as
  `REQUIREMENTS.md` specifies:
  - A buy-in shows a quiet "Confirm" / "Doesn't look right" pair. Disputing does
    **not** change the number — it flags it for the host, with a short note
    explaining that buy-ins are locked and this is a flag, not an edit request.
  - A cash-out (while the game is still live) shows the same pair, but disputing
    here is genuinely actionable — it surfaces immediately on the host's Live Game
    screen as something to fix, since cash-outs remain editable until close.
- Live net, updating as entries come in, using the same win/loss coloring as
  everywhere else. **[decision] Net displays in chips, primary — buy-in counts in
  the feed above stay in banks, subtle**, per `REQUIREMENTS.md`'s "subtle buy-ins,
  prominent value" rule.
- A link to the Share Table view for anyone who wants the communal picture alongside
  their own — My Game never shows other players' numbers itself.

### Edge cases
- ⚠️ **Player confirms a buy-in, host edits something upstream anyway** (shouldn't
  happen for a locked buy-in, but rake edits or a cash-out edit can still change the
  player's *net* even if their own entries are untouched) — net should visibly
  update without requiring the player to re-confirm anything; confirmation is about
  the entries, not the derived net.
- ⚠️ **A dispute on a cash-out, followed by the host correcting it before the player
  sees the outcome** — once corrected, show the dispute as resolved rather than
  leaving it visually "still disputed" against a number that no longer exists.
- **Long sessions with many buy-ins** — the feed should be genuinely scrollable, not
  paginated with extra taps; this is the screen a player checks mid-game, and it
  should stay fast to scan even at 20+ entries.
- ⚠️ **A declined request** — show it plainly in the feed ("not accepted"), don't
  silently remove it; a player who watched their own request disappear with no
  explanation will assume the app is broken, not that the host declined it.
- **A pending request sitting unconfirmed for a long time** — the same
  reassurance-over-spinner treatment as the Join screen's waiting state.

## My Settlements *(new)*

Reached from Home's Player tab. A history of settlement transfers across every game
this player identity has been part of — not just the currently open one.

- A list of transfers, newest game first: who owed/was owed, amount, and status
  (`pending` / `confirmed` / `disputed`), each with **Confirm** / **Request
  change** actions — the latter opens a small optional field for a proposed
  amount/note, matching the same view and action set available on the Share
  Table / RSVP link's post-close state for players who aren't signed into the app.
- **[decision] Reflects the current, live-edited settlement, not a frozen
  snapshot** — per `REQUIREMENTS.md`, a host can adjust who-pays-whom at any time
  after close, and this screen always shows the latest state, same as the shared
  link does. There's no versioning or "this changed" indicator yet (known gap).
- A lifetime summary at the top: total received, total paid, net across all
  settlements — in chips, per `REQUIREMENTS.md` — separate from (but consistent
  with) the overall net shown on the Player tab's summary card, since settlements
  and session net should always agree once every game involved is closed.
- Tapping a transfer's game goes to that game's Game Detail, respecting the normal
  host/player visibility rule there.

### Edge cases
- ⚠️ **A transfer from a game that's still live** — shouldn't appear here yet;
  settlements only exist once a game closes, per `REQUIREMENTS.md`'s Game lifecycle.
- **A very long history** (a daily game accumulates fast) — default to recent-first
  with a clear "load more," not an unbounded single scroll that gets slower over
  time.
- ⚠️ **A transfer's amount or status changed since the player last looked** — since
  there's no change history, just show the current numbers; don't attempt to
  fabricate a "this used to say X" diff the app doesn't actually track.

## Live Game

**Table status** *(new)*: a small, tappable indicator near the top — "7/9
seated" or "Table full (9/9)" — reflecting active (confirmed, not-yet-cashed-out)
players against **Table size** (editable right here, live, per `REQUIREMENTS.md`).
Tapping it also exposes the **Force full / Force open** override for the rare
night the auto-computed status doesn't match what the host wants to signal.

**Player list** (not the primary interaction surface — tapping is):

- Each row: name, buy-in count shown **large and bold** (the one dynamic number that
  matters most), a small status **dot** instead of a text badge (in-play vs.
  settled-win vs. settled-loss color), tap opens the bottom sheet. A small secondary
  indicator shows whether the player has confirmed their latest entry (see My Game
  below) — informational only, never blocking, since confirmation can't reopen a
  locked number.
- **New rows appear once the host confirms a pending request, or via the Replace
  shortcut below** — the host never types a *routine* new-player row in directly;
  see Replace for the one narrow, explicitly-flagged exception.
- A small "Share table" entry point (icon button, top of screen) opens the QR/link
  from the Share Table screen — the host can re-share mid-game if someone new needs
  to join.

**Replace this seat** *(new — the fast path from a cash-out to a new player)*:
surfaces the moment a host confirms a cash-out (see the bottom sheet, below).
- **If a pending request is already waiting**, it's presented right there —
  "Confirm {name}'s {count} buy-ins for this seat?" — one tap, no hunting through
  the Pending requests list separately.
- **If nobody's waiting and the replacement isn't using the app**, a fallback
  "Add them directly" opens the same name / phone / buy-in-count fields self-join
  would have collected. **[decision] This still produces a real, timestamped
  request that the host immediately confirms** — not a silent insert — keeping the
  same audit trail self-join guarantees everywhere else, even though the host
  typed the name in this once. Low-visibility; this is a fallback for a specific
  moment, not a general "add a player" feature, and the same fallback is available
  (equally low-visibility) from the "More" menu for a fully-offline walk-in who
  isn't replacing anyone specific.

**Pending requests** *(replaces the old "self-join grants instantly" model)*:
a dedicated strip or badge-counted list above the player roster, showing every
join request and mid-game "request more buy-ins" that hasn't been acted on yet —
newest first, each row showing the requester's name and requested count.
- **Tapping a pending request opens the same bottom sheet** used for every other
  buy-in action, per `REQUIREMENTS.md`'s "one surface" rule — pre-filled with the
  requested count on the buy-in picker, adjustable before confirming. **Confirm**
  there turns it into a real, timestamped buy-in and (for a join request) admits
  the player to the roster. **Decline** is the one action that doesn't need the
  sheet — a quick inline action right on the pending row, since nothing is being
  added.
- **Host-initiated buy-ins (opening a confirmed player's row directly) skip this
  queue entirely** — auto-confirmed immediately, since the host is the confirming
  authority for their own actions. The queue exists specifically for
  player-initiated requests.

**Photo import** *(last resort, deliberately low-visibility)* — **[decision,
revised]** moved off the primary action row entirely and into an overflow/settings
menu, reflecting that this is a fallback for a host who's reverted to paper for the
night, not a featured capture method. Opens a review screen listing extracted
fields with a confidence indicator per field; anything below the confidence
threshold is highlighted and must be tapped to confirm or correct before import
completes. No field is ever auto-committed silently.

**Stats row**: on-table total, cashed-out total, rake (masked by default, tap to
reveal — rake is editable here up until the game closes, per the updated money
model; edits go through the same reveal-tap surface, not a separate screen).
**[decision, revised] Every figure here displays in chips, primary, with the bank
count subtle beside it** — per `REQUIREMENTS.md`, chips is not a host-only
annotation, it's the value the host actually reads, same as players see on their
own dashboards.

**Live bankroll-check strip**: shows `buy-ins = cashed-out + rake + still in play` is
holding, or surfaces the real error case (`cash-outs + rake` exceeding buy-ins) as a
**non-blocking warning banner** naming the exact overage — visible both at the moment
it's triggered and persistently until resolved. Money still in play mid-game is
normal, not an error; don't flag it. This does **not** block further entry — only
closing the game is blocked while this banner is showing (see "End Game" below).

**The buy-in count picker** *(new — the shared component behind every buy-in
action, host and player alike)*: a big number readout, a slider (shadcn `Slider`,
1–30) for fast scanning, small −/+ stepper buttons flanking it for precision, and
quick-pick chips (1, 2, 3, 5) above it for the common cases. One primary button
below — its label changes by context: "Add N buy-ins" (host, direct), "Confirm N
buy-ins" (host, reviewing a request), "Request N buy-ins" (player, join or
mid-game). Same range, same layout everywhere it appears, per
`REQUIREMENTS.md`'s "similar UI for both" call.

**Bottom sheet** (opens per player, single sheet, no tab navigation between buy-in and
cash-out — and, per `REQUIREMENTS.md`, the *only* surface for adding a buy-in or
cash-out anywhere in the app):

- **Buy-in** is primary: the buy-in count picker above, with the minimum floored at
  the player's already-locked count, a quiet "Locks in 1 min" caption (not a boxed
  warning). **A host opening an existing, already-confirmed player's row is the
  auto-confirmed, direct-add path** — it doesn't touch the Pending requests queue.
  **A host opening the sheet from a pending request** sees the same picker
  pre-filled with the requested count, adjustable, ending in Confirm or Decline.
  Once locked, the slider becomes fully non-interactive (not just floored) —
  `REQUIREMENTS.md` treats the lock as permanent with no override, so the UI
  shouldn't imply otherwise.
- **Cash out this player** is a small toggle (shadcn `Switch`) below the buy-in
  section — flipping it on **hides the buy-in picker entirely** (buy-ins lock
  while cashing out) and reveals: a small "N buy-ins · X banks in — locked while
  cashing out" reference line (buy-in figure shown **once**, not duplicated), a large
  "Cashing out" number, live net, a calculator keypad (0–9, ⌫, C) that accepts any
  value including large ones (e.g. `14500`) with no rounding to stake multiples,
  "Confirm cash out" button. After confirming, the sheet **stays editable**
  (re-openable, keypad re-enabled) until the game closes — cash-outs are not
  locked like buy-ins.

"End Game & Settle" button at the bottom, only rendered when `players.length > 0`
(consequence of the Create Game gate above). Tapping it is the explicit **close-game**
action from `REQUIREMENTS.md` — it's disabled (not hidden) while the overpay banner
is active, with inline copy explaining why, so the host isn't left guessing why the
button won't respond.

### Edge cases
- ⚠️ **Closing with players who never cashed out** (walked away, house absorbs it) —
  per `REQUIREMENTS.md`, closing shouldn't require every player to have a cash-out.
  Confirm this explicitly in the close-game confirmation dialog: "N players have no
  cash-out recorded — their buy-ins will count as a loss to the table. Continue?"
  rather than closing silently with an implicit assumption.
- ⚠️ **Re-opening the bottom sheet for a player already cashed out, after close** —
  should render read-only (numbers shown, no keypad/slider), not just fail silently
  or throw, since Game Detail links back here conceptually for hosts reviewing a
  closed game.
- **Rake edited after some cash-outs already entered** — recheck the overpay banner
  immediately on rake change, not just on cash-out entry; rake is part of the same
  invariant and editing it can trigger (or resolve) the same warning.
- ⚠️ **A pending request from someone the host doesn't recognize** (name matches
  nobody the host expected tonight) — Confirm/Decline should be equally easy; the
  UI shouldn't nudge toward confirming just because it's the "positive" action, since
  a stranger requesting to join a leaked link is exactly the scenario this queue
  exists to catch.
- ⚠️ **Multiple pending requests arriving close together** (several people join at
  once) — each needs its own Confirm/Decline, not a bulk "confirm all," since
  batch-confirming defeats the point of a per-request money gate.
- **Photo import mid-game vs. as the only entry method for the whole game** — both
  are valid; importing mid-game should merge into the existing live ledger (adding
  to current counts) rather than overwriting what's already been tapped in, and
  should re-run the overpay check immediately after merging.
- ⚠️ **Table size lowered below the current active-seated count** (host drops it
  from 9 to 8 with 9 people already playing) — should read as "full" immediately
  (9/8), not error or silently clamp; nobody gets removed, it's just a status, and
  the host can raise it back just as easily.
- ⚠️ **Host declines the Replace prompt's suggested pending request** (it's not
  actually who's taking the seat) — should fall straight through to "Add them
  directly" or back to the general Pending requests list, not dead-end.
- **Multiple cash-outs in quick succession, each triggering its own Replace
  prompt** — prompts shouldn't stack or block each other; handle one seat's
  replacement at a time, dismissible without committing to anything.
- **A Replace-flow direct-add and a genuine self-join request for the same person
  arrive around the same time** — matching by phone (E.164) should prevent a
  duplicate; if the phone the host types matches an existing pending request,
  treat it as that request rather than creating a second one.

## Settlement

Computed transfers (winners paid by losers, rake excluded per the invariant) shown as
a list, each tappable to open an edit sheet: From/To as roster **pill pickers**
(never free text — renamed from the earlier "chip pickers" to avoid colliding with
the new Chips settlement unit below), amount via the same calculator keypad,
Remove/Save actions. "Add custom payment" opens the identical sheet blank.
**[decision] The From/To pickers are a genuine reassignment tool, not just an
amount editor** — the host can pick any winner/loser pairing from the roster, not
only adjust the amounts on the already-computed pairs. A balance-check message
surfaces if buy-ins and cash-outs don't reconcile (tolerance ~50 units for
100-unit display rounding).

**[decision, revised] Every amount on this screen — transfer amounts, the balance
check — displays in chips, not banks.** Per `REQUIREMENTS.md`, chips is
specifically "what players refer during settlements": this is the one screen
where showing banks instead would be a real mistake, not just a style choice.

Transfers are computed with a **deterministic tie-break** (ascending player ID on
equal nets, per `REQUIREMENTS.md`) as the *starting point* — the host is free to
depart from it.

**[decision, revised] Settlement is never frozen — this screen stays reachable and
editable indefinitely**, not just in a pre-close window. Reached the same way as
before ("End Game & Settle"), but also reachable afterward from Game Detail, at any
time, per `REQUIREMENTS.md`'s revised Game lifecycle. Buy-ins, cash-outs, and rake
remain frozen at close as always — only the settlement/transfer layer stays open.

**Distribution — the same evolving link, not WhatsApp Business API** *(revised)*:
each transfer gets a **payment status** badge — `pending` / `confirmed` / `disputed`
— starting at `pending`. Instead of the app sending templated per-player WhatsApp
messages, the host taps **"Update shared link"** to publish the current settlement
state to the Share Table / RSVP link (see that screen's State 3) — the same link
used throughout the game's life, with a plain confirmation-of-game-details
announcement (no numbers) as the text the host actually pastes into the group chat.
Each viewer who opens the link afterward sees only their own line and can
Confirm/**Request change** it there; a signed-in player sees the identical content
on My Settlements instead. **[decision, revised]** "Request change" replaces the
earlier "Dispute" label and adds an **optional proposed amount/note field** — the
player can say what they think it should be, not just flag disagreement. **This
never reopens or recomputes anything on its own** — the host has standing authority
to edit settlement at any time regardless, and a request is simply a signal, now
with more information attached, to go do that.

### Edge cases
- ⚠️ **Manually reassigning who-pays-whom breaks the reconciliation total** — e.g.
  host repoints a transfer to a different winner without adjusting amounts
  elsewhere. The balance-check message should recompute live as the host edits, not
  just once on screen load.
- ⚠️ **Removing a computed transfer entirely** (host wants to record it as "settled
  in person, no need to track") vs. **deleting because it's wrong** — same Remove
  action today; worth a quiet confirmation ("This player's transfer won't appear in
  the shared settlement") so it doesn't read as recomputing the math, since removing
  a line doesn't rebalance the others automatically.
- ⚠️ **Host edits settlement without tapping "Update shared link"** — the edit is
  saved, but the link (and My Settlements for other players) keeps showing the
  previous published state until the host explicitly publishes again; the screen
  should make this staleness visible ("Unpublished changes") rather than implying
  edits go out automatically.
- ⚠️ **A player disputes a line, and the host later re-publishes without changing
  it** — the dispute status should be something the host can clear explicitly
  (e.g. "Mark resolved") when they've talked it out in person, not something that
  lingers forever once the underlying number stops changing.
- **A game with an already-published settlement gets edited again days later** —
  fully supported by design (see the revised Game lifecycle), but there's no audit
  trail of what changed (known gap) — don't build UI that implies there is one.

## Game Detail

**Role-aware** — this is not optional, it's the core privacy rule:

- If the viewer **is** the game's host: full breakdown — pot, player count, rake
  (masked/revealable), every player's in/out/net sorted by net, the settlement log.
- If the viewer **is not** the host (just a player in someone else's game): only their
  own buy-in, cash-out, and net. Nothing about other players, no rake, no leaderboard.
- **Live vs. closed**: a `live` game viewed here shows current-state numbers with a
  clear "Game in progress" indicator and a link back to Live Game for the host; a
  `closed` game shows frozen buy-ins/cash-outs/rake alongside the **current**
  settlement state, which — per the revised Game lifecycle — is not itself frozen
  and can still change if the host edits it later. The host's view includes an
  entry point back into Settlement to make exactly that edit.

### Edge cases
- ⚠️ **A player identity that only ever exists as a device-local join session**
  (never went through the host track's email login) opening this screen for a game
  they're in — the non-host visibility rule still applies exactly the same way;
  having a lighter identity doesn't mean less trust with other players' numbers, it
  means less trust *in* their own identity being verified (see Known gaps).
- **Host viewing a closed game they also played in** — the "full breakdown" and
  "personal net" views need to coexist clearly (their own row shouldn't be visually
  ambiguous in the full player list), since a host is also always a player.

## Venue Detail *(new)*

Reached by tapping a venue name (from Create Game's picker, a game's detail page, or
a venues list entry point on Home). **Visible to anyone who has played a game there
at least once** — this is not host-only, and not scoped to games this account
hosted or played in personally, per `REQUIREMENTS.md`.

- Header: venue name, total games played there, date range (first game to most
  recent).
- Stats: average pot/rake collected across all games at this venue, a "regulars"
  list ranked by attendance frequency (name + games-played count, no financial
  figures next to it), and which accounts have hosted here. **[decision] Pot and
  rake figures display in chips.**
- ⚠️ **Games at the same venue can have different chip ratios** (one host runs
  `1:1`, another runs `1:2`) — averaging "pot" across them in chips is
  aggregating numbers that meant different real value at the time. Not solved
  here; worth a second look before this screen ships, flagged rather than
  silently averaged as if the ratio were constant.
- **[decision, new] Two charts**: a pot-size trend across recent games at this
  venue, and an attendance bar chart for the regulars list. Both aggregate,
  consistent with the no-individual-financials rule below — a pot-over-time trend
  doesn't expose any one player's number.
- **[decision, new] The games list's columns split by the viewer's role in each
  specific game, not a single fixed layout:**
  - **A game the viewer hosted:** date, player count, pot/game data, and a
    settlement summary (e.g. "6 transfers, 4 confirmed") shown right in the row.
  - **A game the viewer only played in:** date, and *only their own* game data and
    settlement outcome for that game — nothing about other players in that row.
  - Tapping either kind of row still goes to that game's normal Game Detail,
    **which still applies the existing host/player visibility rule** — the row's
    columns are a preview of what Game Detail already shows, not a bypass of it.
- **No net, win/loss, or cross-host leaderboard appears anywhere on this screen** —
  deliberately, per `REQUIREMENTS.md`. This is an aggregate-and-attendance view, not
  a financial one.

### Edge cases
- ⚠️ **A brand-new venue with one game and one player** — the "regulars" list and
  averages should read as genuinely sparse (not broken/loading), since there's
  nothing to rank yet.
- ⚠️ **A player who attended once, years ago, and never returned** — still shows up
  correctly in "regulars" ranked low, not hidden; the visibility rule is "played
  here at least once," not "plays here regularly."
- **Venue with games under two different typed names** (the dedup gap from
  `REQUIREMENTS.md`) — no in-app fix; this screen will just show an incomplete
  picture of that place's real history until someone notices and a merge tool
  exists.

## Global

- Warm, white-canvas theme throughout (`DESIGN-airbnb.md` tokens), layered with
  shadcn/ui components mapped to the same tokens (see Theming section above) — no
  currency symbols anywhere, bank units only, whole numbers on display. Individual
  figures round independently; displayed totals are computed from full precision
  and rounded once, so a ±1 bank disagreement between a total and its visible parts
  is expected, not a bug (see `REQUIREMENTS.md`).
- Bottom nav: Home + Live (when a game's active) only — no History entry.
- `overflow-x: hidden` on `html, body` plus responsive `max-w-[430px] w-full`
  containers — don't reintroduce fixed pixel widths that could overflow on narrow
  phones.

### Edge cases
- ⚠️ **Offline / connection loss mid-entry** (buy-in tap, cash-out confirm, rake
  edit) — not addressed anywhere in either doc. Given this is a PWA and hosts will be
  using it at a table with patchy signal, worth deciding now whether writes queue
  locally and retry, or the UI blocks with a clear "no connection" state — silent
  data loss on a money-tracking app is the worst-case failure mode here.
