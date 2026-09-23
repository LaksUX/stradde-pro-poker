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

| Component | Purpose | Used on |
|---|---|---|
| `Button.tsx` | primary/ghost/danger variants, `block` full-width mode | nearly every page |
| `BuyinPicker.tsx` | stepper control for buy-in counts | Join, MyGame |
| `ConfirmDialogHost.tsx` | module-level pub/sub confirm dialog (`confirmDialog()`) | global, mounted once |
| `InviteQrCard.tsx` | shared QR+link card (eyebrow/title/subtitle/url) | LiveGame, Home (entity), ScheduledGame, ShareTable |
| `OfflineBanner.tsx` | global offline indicator | global, mounted once |
| `SegmentedControl.tsx` | tab/toggle control | Home (Player/Host), CreateGame |
| `Spinner.tsx` | exports `PageSpinner` (full-page) and `InlineSpinner` (inline loading) | nearly every page |
| `StatCard.tsx` | eyebrow/value stat block | Home, GameDetail, MyGame |
| `Toaster.tsx` | module-level pub/sub toast (`toast.success/error()`) | global, mounted once |

## Layout convention

Every page wraps content in `mx-auto max-w-sm p-6`, with two width outliers:
- `LiveGame.tsx` and `Settlement.tsx` use `max-w-md` instead of `max-w-sm` (need more room for player rows)

Worth checking consistency of this choice during any sweep.

## Design tokens (`src/index.css`)

Dark theme: `--color-canvas: #0a0e17`, primary orange `#ff7a29`, win `#34d399`, error `#f75466`. All numeric figures use `font-mono`/`tabular-nums`.
