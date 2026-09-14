-- Poker Night — core schema
-- Mirrors REQUIREMENTS.md as of the tenth revision. Read that file alongside
-- this one; every non-obvious column below has a corresponding [decision] there.

-- ============================================================================
-- PROFILES — one row per Supabase auth user, both tracks (host + player)
-- ============================================================================
-- Host track: real Supabase Auth user (email magic-link), admin-approved.
-- Player track: Supabase Anonymous Sign-in, identified by phone (E.164), no
-- email/password. Both tracks get a row here; `role`/`approved` only matter
-- for the host track. See REQUIREMENTS.md "Access model".

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text unique, -- E.164, the player-track identity key
  role text not null default 'player' check (role in ('player', 'host', 'admin')),
  approved boolean not null default false, -- host approval gate; irrelevant for players
  created_at timestamptz not null default now()
);

create index profiles_phone_idx on profiles (phone);

-- ============================================================================
-- VENUES — shared, global entity, independent of any single host
-- ============================================================================
-- See REQUIREMENTS.md "Venues": a venue is not owned by whoever created it;
-- history there aggregates regardless of who's hosting on a given night.

create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create unique index venues_name_idx on venues (lower(name)); -- coarse dedup aid only —
-- REQUIREMENTS.md's dedup gap is real: this stops exact-lowercase duplicates,
-- not "Kumar's house" vs "Kumar's Place". A typeahead in the UI is the real
-- mitigation; do not rely on this index to solve the gap.

-- ============================================================================
-- GAMES
-- ============================================================================
-- status: 'scheduled' | 'live' | 'closed' — see REQUIREMENTS.md "Game lifecycle".
-- chip_ratio: '1:1' | '1:2' — see "Money model" Chips decision. Locked once
-- status leaves 'scheduled'/is created live; enforced at the application layer
-- (a CHECK constraint can't easily express "immutable after row exists" —
-- see the trigger below for that instead).

create table games (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles(id),
  venue_id uuid references venues(id),
  venue_freetext text, -- fallback for a one-off location not saved as a venue
  name text not null,
  scheduled_for timestamptz not null default now(),
  status text not null default 'live' check (status in ('scheduled', 'live', 'closed')),
  stake numeric not null check (stake > 0), -- banks per buy-in
  chip_ratio text not null default '1:1' check (chip_ratio in ('1:1', '1:2')),
  table_size int not null default 9 check (table_size > 0), -- live-editable, unlike stake/chip_ratio
  table_status_override text check (table_status_override in ('full', 'open')), -- null = auto
  rake numeric not null default 0 check (rake >= 0), -- banks, host-only, editable until close
  settlement_published_at timestamptz, -- null until host first publishes
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index games_host_idx on games (host_id);
create index games_venue_idx on games (venue_id);
create index games_status_idx on games (status);

-- Lock stake / chip_ratio once the game has ever been 'live' or 'closed' —
-- see REQUIREMENTS.md: changing either later would retroactively change the
-- value of already-confirmed buy-ins.
create or replace function lock_stake_and_ratio_after_start()
returns trigger as $$
begin
  if old.status <> 'scheduled' then
    if new.stake <> old.stake or new.chip_ratio <> old.chip_ratio then
      raise exception 'stake and chip_ratio are locked once a game has started';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger games_lock_stake_ratio
  before update on games
  for each row execute function lock_stake_and_ratio_after_start();

-- ============================================================================
-- PLAYERS — one row per person per game; the row IS the account link
-- ============================================================================
-- No unclaimed/claimed distinction — see REQUIREMENTS.md "Player identity —
-- superseded by self-join". A player row exists only once a join request has
-- been confirmed (see buyin_requests below); there is no "pending player" row.

create table game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  is_host boolean not null default false,
  cashout numeric, -- null = still in play; any non-negative number once entered
  cashout_confirmed_at timestamptz,
  cashout_confirm_status text check (cashout_confirm_status in ('confirmed', 'disputed')),
  joined_at timestamptz not null default now(),
  unique (game_id, profile_id)
);

create index game_players_game_idx on game_players (game_id);

-- ============================================================================
-- BUY-IN REQUESTS — the request/confirm handshake at the heart of the money model
-- ============================================================================
-- One row per request (join or mid-game "more buy-ins"), carrying a count —
-- not one row per individual buy-in. See REQUIREMENTS.md "Joining a game" and
-- "Money model": only 'confirmed' rows count toward any total.

create table buyin_requests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  -- For a join request, profile_id may reference a not-yet-existing game_players
  -- row (the row is created on confirm). For a mid-game request, game_player_id
  -- is already known.
  profile_id uuid not null references profiles(id),
  requester_name text not null, -- captured at request time even for a new profile
  game_player_id uuid references game_players(id),
  request_type text not null check (request_type in ('join', 'more_buyins')),
  count int not null check (count >= 1),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  player_confirm_status text check (player_confirm_status in ('confirmed', 'disputed')),
  is_direct_add boolean not null default false, -- host typed this in directly — see
  -- REQUIREMENTS.md's narrow "Replace this seat" exception; still a real,
  -- immediately-confirmed request, never a silent insert.
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  locks_at timestamptz generated always as (confirmed_at + interval '1 minute') stored
);

create index buyin_requests_game_idx on buyin_requests (game_id);
create index buyin_requests_player_idx on buyin_requests (game_player_id);
create index buyin_requests_status_idx on buyin_requests (game_id, status);

-- ============================================================================
-- SETTLEMENT TRANSFERS — indefinitely host-editable, published separately
-- ============================================================================
-- See REQUIREMENTS.md "Game lifecycle": buy-ins/cash-outs/rake freeze at
-- close, settlement does NOT. This table is the current, live-edited state;
-- games.settlement_published_at marks when it was last shared out.

create table settlement_transfers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  from_player_id uuid not null references game_players(id),
  to_player_id uuid not null references game_players(id),
  amount numeric not null check (amount > 0), -- banks; convert to chips at display time
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'disputed')),
  request_note text, -- optional proposed-amount/note from a "Request change"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index settlement_transfers_game_idx on settlement_transfers (game_id);
