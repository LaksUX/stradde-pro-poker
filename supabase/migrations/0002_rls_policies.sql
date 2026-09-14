-- Poker Night — Row Level Security
-- Every rule here corresponds to a named decision in REQUIREMENTS.md. Read the
-- comment above each policy alongside that file, not this one in isolation —
-- RLS is exactly the kind of code where "it compiles" and "it's correct" are
-- very different things, and the visibility rules are the whole trust model.

alter table profiles enable row level security;
alter table venues enable row level security;
alter table games enable row level security;
alter table game_players enable row level security;
alter table buyin_requests enable row level security;
alter table settlement_transfers enable row level security;

-- Helper: is the current user the host of this game?
create or replace function is_game_host(p_game_id uuid)
returns boolean as $$
  select exists (
    select 1 from games where id = p_game_id and host_id = auth.uid()
  );
$$ language sql stable security definer;

-- Helper: does the current user have a confirmed game_players row in this game?
create or replace function is_confirmed_player(p_game_id uuid)
returns boolean as $$
  select exists (
    select 1 from game_players
    where game_id = p_game_id and profile_id = auth.uid()
  );
$$ language sql stable security definer;

-- ============================================================================
-- PROFILES
-- ============================================================================
-- Anyone can read their own profile; admins can read all (for the Admin
-- approve/revoke screen). No one can read another player's or host's profile
-- directly — names surface through game_players, not profiles, everywhere
-- else in the app.

create policy "read own profile" on profiles
  for select using (id = auth.uid());

create policy "admin reads all profiles" on profiles
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "update own profile" on profiles
  for update using (id = auth.uid());

create policy "insert own profile on signup" on profiles
  for insert with check (id = auth.uid());

create policy "admin updates approval" on profiles
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================================
-- VENUES
-- ============================================================================
-- Per REQUIREMENTS.md "Venues": visible to anyone who has played a game
-- there at least once. Simplified here to "any authenticated user can read" —
-- tightening to "played there at least once" needs a join against
-- game_players + games and is worth doing before this leaves prototype status,
-- but venues carry no financial data, so this is a low-severity gap to defer.

create policy "any authenticated user reads venues" on venues
  for select using (auth.uid() is not null);

create policy "approved hosts create venues" on venues
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'host' and p.approved)
  );

-- ============================================================================
-- GAMES
-- ============================================================================
-- The host sees full detail on their own games, always. A confirmed player
-- sees the game row they're part of (needed for Game Detail, My Game, etc.)
-- but note: this policy alone does NOT leak other players' money — that's
-- enforced on game_players/buyin_requests/settlement_transfers below, not
-- here. Anonymous/public read is intentionally narrow: only non-financial
-- columns matter for the Shared table pre-join and live states, which is
-- enforced by exposing those states through a view (below), not this table
-- directly.

create policy "host reads own games" on games
  for select using (host_id = auth.uid());

create policy "confirmed player reads their game" on games
  for select using (is_confirmed_player(id));

create policy "host creates games" on games
  for insert with check (
    host_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'host' and p.approved)
  );

create policy "host updates own games" on games
  for update using (host_id = auth.uid());

-- Public, unauthenticated read for the Shared table / RSVP link's pre-join
-- and post-close states — deliberately narrow, non-financial columns only.
-- See REQUIREMENTS.md "Live-capture experience": this is the one intentional
-- exception to "player who is not host sees only their own numbers," scoped
-- to exactly the fields the paper sheet on a real table would show anyone
-- glancing at it. Never select rake, stake internals, or other players' cash
-- through this view.
create view public_game_summary as
  select id, name, venue_id, venue_freetext, scheduled_for, status, stake,
         table_size, table_status_override, host_id
  from games;

alter view public_game_summary set (security_invoker = false);
grant select on public_game_summary to anon;

-- ============================================================================
-- GAME_PLAYERS — the core "who sees whose money" boundary
-- ============================================================================
-- Host: full read of every player row in their own game.
-- Player: read ONLY their own row. This is the load-bearing policy for
-- REQUIREMENTS.md "Roles inside a game": "A player who is not the host sees
-- only their own buy-in/cash-out/net — never anyone else's numbers."

create policy "host reads all players in own game" on game_players
  for select using (is_game_host(game_id));

create policy "player reads own row only" on game_players
  for select using (profile_id = auth.uid());

create policy "host inserts confirmed players" on game_players
  for insert with check (is_game_host(game_id));

create policy "host updates players in own game" on game_players
  for update using (is_game_host(game_id));

-- Anonymous, names-and-buy-in-count-only read for the Shared table's
-- post-join live state — see REQUIREMENTS.md: "a list of the other players
-- by name only, ordered by buy-in count... no other player's exact number [to
-- a viewer who isn't them]." This is intentionally coarser than the app UI
-- (the UI hides all but the viewer's own count; this view can't distinguish
-- "viewer" at the database layer without a session, so it's restricted to a
-- narrow column set and confirmed buy-in counts only — no cashout, no net).
-- Treat this as a known simplification to revisit, not a finished answer —
-- flag it before this leaves prototype status.
create view public_live_roster as
  select gp.game_id, gp.profile_id, p.full_name,
         coalesce(sum(br.count) filter (where br.status = 'confirmed'), 0) as buyin_count
  from game_players gp
  join profiles p on p.id = gp.profile_id
  join games g on g.id = gp.game_id and g.status = 'live'
  left join buyin_requests br on br.game_player_id = gp.id
  group by gp.game_id, gp.profile_id, p.full_name;

grant select on public_live_roster to anon;

-- ============================================================================
-- BUYIN_REQUESTS
-- ============================================================================
-- Host: full read/write on requests in their own game (the Pending requests
-- queue, and confirm/decline). Player: read/write only their own requests
-- (their own timestamped feed, and submitting new requests).

create policy "host reads all requests in own game" on buyin_requests
  for select using (is_game_host(game_id));

create policy "player reads own requests" on buyin_requests
  for select using (profile_id = auth.uid());

create policy "anyone confirmed-or-new can submit a request" on buyin_requests
  for insert with check (profile_id = auth.uid());

create policy "host confirms or declines requests" on buyin_requests
  for update using (is_game_host(game_id));

create policy "player sets their own confirm/dispute flag" on buyin_requests
  for update using (profile_id = auth.uid());
  -- Note: this policy is intentionally broad at the row level; the
  -- application layer must only ever let a player change
  -- player_confirm_status, never status/count/confirmed_at. Enforce that with
  -- a trigger before this leaves prototype status — documented here as a
  -- known gap rather than silently assumed safe.

-- ============================================================================
-- SETTLEMENT_TRANSFERS
-- ============================================================================
-- Host: full read/write, indefinitely (per REQUIREMENTS.md, settlement is
-- never frozen). Player: read only transfers where they're the payer or
-- payee, and can only set status/request_note on those — never amount or
-- who's involved.

create policy "host manages settlement in own game" on settlement_transfers
  for all using (is_game_host(game_id));

create policy "player reads own transfers" on settlement_transfers
  for select using (
    exists (
      select 1 from game_players gp
      where gp.id in (from_player_id, to_player_id) and gp.profile_id = auth.uid()
    )
  );

-- Public read for the post-close Shared table / RSVP link state — same
-- pattern as public_game_summary, scoped to what a specific phone should see.
-- A real implementation needs this gated by the requesting phone matching
-- from_player_id/to_player_id's profile, which means routing through an
-- edge function or RPC rather than a bare view/anon grant — flagged here as
-- the next thing to build, not solved by this migration.
