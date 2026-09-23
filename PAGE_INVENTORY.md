# Page & Component Inventory

Reference doc for UI sweeps — lists every route, what kind of screen it is, and which shared components it uses. Update this when pages/components are added, renamed, or removed.

## Page types

### Auth / entry (public, unauthenticated)
- `Continue.tsx` — phone login/OTP entry
- `PendingApproval.tsx` — waiting-state page for unapproved hosts
- `ApplyToHost.tsx` — form to request host access

### Public game links (no login required, shared via QR/link)
- `Join.tsx` (`/join/:gameId`) — walk-in buy-in request flow
- `ScheduledGame.tsx` (`/games/:gameId/scheduled`) — pre-game waiting page, host-gated start button
- `ShareTable.tsx` (`/t/:gameId`) — public live-table view/QR landing
- `EntityLink.tsx` (`/e/:slug`) — permanent host link, auto-resolves to whatever's live/scheduled

### Home / dashboard
- `Home.tsx` (`/home`) — tabbed Player/Host dashboard, stats + game lists + entity card

### Host workflow
- `CreateGame.tsx` (`/games/new`) — multi-field game creation form
- `LiveGame.tsx` (`/games/:gameId/live`) — the core live-hosting screen: player list, pending requests, buy-in controls
- `Settlement.tsx` (`/games/:gameId/settlement`) — post-game transfer reconciliation, edit-on-tap rows

### Player workflow
- `MyGame.tsx` (`/games/:gameId/my-game`) — a player's own view of a live game (their buy-ins/cashout)
- `MySettlements.tsx` (`/my-settlements`) — list of a player's pending/owed settlements across games

### Detail / history views
- `GameDetail.tsx` (`/games/:gameId`) — read-only closed-game summary
- `VenueDetail.tsx` (`/venues/:venueId`) — venue history, multiple games, trend stats

### Admin
- `Admin.tsx` (`/admin`) — host-approval queue, admin-only

## Routes (from `src/App.tsx`)

```
/                              → RootRedirect
/continue                      → Continue
/join/:gameId                  → Join
/games/:gameId/scheduled       → ScheduledGame
/t/:gameId                     → ShareTable
/e/:slug                       → EntityLink
-- AppShell (authenticated) --
/apply-to-host                 → ApplyToHost
/home                          → Home
/pending-approval               → PendingApproval
/admin                         → Admin
/games/new                     → CreateGame
/games/:gameId/live            → LiveGame
/games/:gameId/settlement      → Settlement
/my-settlements                → MySettlements
/games/:gameId                 → GameDetail
/games/:gameId/my-game         → MyGame
/venues/:venueId               → VenueDetail
```

## Shared UI components (`src/components/ui/`)

shadcn/ui (Base UI primitives) is the standard going forward — see REQUIREMENTS.md "Stack". Every screen in the app now draws from this set; there's no longer a parallel hand-rolled version of any of these (SegmentedControl and StatCard were retired once their last callers moved to Tabs/Card).

| Component | Purpose | Used on |
|---|---|---|
| `Button.tsx` | primary/ghost/danger variants, `block` full-width mode — hand-rolled, not shadcn's `button.tsx` (name collision, see below) | nearly every page |
| `card.tsx` | Card/CardHeader/CardTitle/CardContent/CardFooter/CardDescription/CardAction — the "stat-card" surface | nearly every page |
| `tabs.tsx` | Tabs/TabsList/TabsTrigger/TabsContent (Base UI) — the "segmented-tab" control, stadium-shaped, solid-primary active state | Home, CreateGame, LiveGame |
| `table.tsx` | Table/TableHeader/TableBody/TableRow/TableHead/TableCell — for genuinely tabular lists | Home, Admin, GameDetail, VenueDetail, ShareTable |
| `badge.tsx` | status pills + the win/error "delta badge" that sits next to a figure | nearly every page |
| `input.tsx` | styled text input | Continue, CreateGame, Join, LiveGame, Settlement, MySettlements |
| `select.tsx` | styled native `<select>` (not Base UI's popup Select — a compact inline control was the right amount of machinery for the one call site) | Settlement |
| `label.tsx` | form field label, `.type-label-caption` styled | Continue, CreateGame, Join, LiveGame, Settlement |
| `separator.tsx` | Base UI Separator | available, not yet used by a page |
| `BuyinPicker.tsx` | stepper control for buy-in counts (hand-rolled, no shadcn equivalent needed) | Join, MyGame |
| `ConfirmDialogHost.tsx` | module-level pub/sub confirm dialog (`confirmDialog()`) | global, mounted once |
| `InviteQrCard.tsx` | shared QR+link card (eyebrow/title/subtitle/url) | LiveGame, Home (entity), ScheduledGame, ShareTable |
| `OfflineBanner.tsx` | global offline indicator | global, mounted once |
| `Spinner.tsx` | exports `PageSpinner` (full-page) and `InlineSpinner` (inline loading) | nearly every page |
| `Toaster.tsx` | module-level pub/sub toast (`toast.success/error()`) | global, mounted once |

A shadcn `button.tsx` was generated once and removed — it collided by case only with the existing hand-rolled `Button.tsx` (a hard TypeScript error, and silently broken on a case-insensitive filesystem). Check for this before adding a new shadcn component that shares a name with something already hand-rolled (`Spinner` was the other near-miss).

## Typography scale (`src/index.css`)

Formalized from `DESIGN-dashboard.md`'s "typography" section as real classes, deliberately prefixed `.type-` rather than `.text-` — the `cn` package's tailwind-merge-style engine treats an unrecognized `text-*` class as conflicting with real Tailwind text utilities and silently drops whichever comes first (e.g. `"text-figure-hero text-ink"` would merge down to just `"text-ink"`).

| Class | Role |
|---|---|
| `.type-figure-hero` | the one big number a screen exists to show (40px/700/mono/tabular) |
| `.type-figure-md` | inline/table numbers (16px/600/mono/tabular) |
| `.type-page-title` | every page's `<h1>` (18px/700) |
| `.type-label-caption` | eyebrows/section headings (11px/700/uppercase/1px tracking) — also `CardTitle`'s default and `Label`'s default |
| `.type-body-md` | description/body copy (16px/400) |

Figures stay `text-ink` (white) per DESIGN-dashboard.md's delta-badge convention — the win/loss signal goes on a small `Badge` next to the figure, not painted across the whole number. Always combine a `.type-*` class with a real Tailwind color utility (`text-ink`, `text-win`, etc.) in the same `className`, never rely on the `.type-*` class alone for color.

## Layout convention

Every page wraps content in `mx-auto max-w-sm p-6`, with two width outliers:
- `LiveGame.tsx` and `Settlement.tsx` use `max-w-md` instead of `max-w-sm` (need more room for player rows)

Worth checking consistency of this choice during any sweep.

## Design tokens (`src/index.css`)

Dark theme: `--color-canvas: #141a26` (elevated surface), `--color-surface-soft: #0a0e17` (page floor), primary orange `#ff7a29`, win `#34d399`, error `#f75466`. shadcn/Base UI's semantic tokens (`--color-background`, `--color-card`, `--color-border`, etc.) are bridged onto these same values rather than shadcn's own default palette — see the `@theme` block's comment in `src/index.css`.
