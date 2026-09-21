-- Hosting entities — the foundation for "many different hosting entities in
-- one ecosystem" (individual hosts today, clubs later), tested first on
-- today's existing solo hosts before any club-only feature exists. See
-- REQUIREMENTS.md's thirteenth revision note.
--
-- Deliberately additive, not a rewrite: games.host_id stays the sole
-- authority for every permission check in the app (is_game_host(), every
-- RLS policy, every UI role check) — nothing about who can confirm a
-- buy-in or close a game changes here. hosting_entities is a new, parallel
-- identity/discovery layer a game also points to, which is what the first
-- real feature riding on it (the entity's permanent "whatever's live right
-- now" link) needs and host_id alone can't give: a stable identity that
-- outlives any one game's one-off link.

create table hosting_entities (
  id uuid primary key default gen_random_uuid(),
  -- 'club' is real schema, not aspirational — the type this migration
  -- doesn't yet give any distinct behavior to. Every row created here is
  -- 'house'; a club's multi-staff roster is a separate future migration
  -- (a hosting_entity_staff join table), not implied by this column.
  type text not null default 'house' check (type in ('house', 'club')),
  name text not null,
  -- The permanent, human-shareable identity — printed once, unlike a
  -- per-game link that gets reminted every night.
  slug text not null unique,
  owner_profile_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index hosting_entities_owner_idx on hosting_entities (owner_profile_id);

alter table hosting_entities enable row level security;

create policy "owner reads own entity" on hosting_entities
  for select using (owner_profile_id = auth.uid());

create policy "owner updates own entity" on hosting_entities
  for update using (owner_profile_id = auth.uid());

create policy "approved host creates own entity" on hosting_entities
  for insert with check (
    owner_profile_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'host' and p.approved)
  );

-- Public, unauthenticated read for the /e/:slug permanent link — name only,
-- never owner_profile_id. Same shape as public_game_summary's existing
-- narrow-columns-only anon grant.
create view public_hosting_entity_summary as
  select id, name, slug, type from hosting_entities;

alter view public_hosting_entity_summary set (security_invoker = false);
grant select on public_hosting_entity_summary to anon;

-- ============================================================================
-- GAMES — points at an entity, in addition to (not instead of) host_id
-- ============================================================================

alter table games add column hosting_entity_id uuid references hosting_entities(id);
create index games_hosting_entity_idx on games (hosting_entity_id);

-- public_game_summary (0002_rls_policies.sql) needs hosting_entity_id so an
-- anonymous visitor on /e/:slug can find "the latest live/scheduled game for
-- this entity" without any new exposure — hosting_entity_id is no more
-- sensitive than the host_id this view already exposes.
create or replace view public_game_summary as
  select id, name, venue_id, venue_freetext, scheduled_for, status, stake,
         table_size, table_status_override, host_id, hosting_entity_id
  from games;

alter view public_game_summary set (security_invoker = false);
grant select on public_game_summary to anon;

-- ============================================================================
-- BACKFILL — one house entity per existing host, every existing game
-- repointed at it. One-time; the app itself creates an entity lazily (same
-- pattern as venue find-or-create) the first time a host without one yet
-- creates a game, going forward.
-- ============================================================================

insert into hosting_entities (type, name, slug, owner_profile_id)
select
  'house',
  coalesce(p.full_name, 'Home') || '''s games',
  lower(regexp_replace(coalesce(p.full_name, 'host'), '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || substr(p.id::text, 1, 6),
  p.id
from (select distinct host_id from games) g
join profiles p on p.id = g.host_id;

update games
set hosting_entity_id = he.id
from hosting_entities he
where he.owner_profile_id = games.host_id
  and games.hosting_entity_id is null;
