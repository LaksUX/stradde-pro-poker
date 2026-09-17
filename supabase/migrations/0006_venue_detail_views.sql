-- Venue Detail (PAGE_PROMPTS.md) needs two cross-host aggregates that the
-- existing per-game RLS can't answer: "average pot/rake at this venue" and
-- a "regulars" attendance ranking, both computed across every closed game
-- at a venue regardless of who hosted it. The base tables intentionally
-- don't allow that (`games`' host/player policies only ever expose games
-- you hosted or played in) — REQUIREMENTS.md's Venues section calls this
-- aggregation out as a real, wanted feature, not a leak to patch over, so
-- the fix is two security-definer-style views (no `security_invoker`, same
-- pattern as `public_live_roster`), grabbable by any authenticated user.
--
-- [decision, known simplification] This is coarser than REQUIREMENTS.md's
-- stated rule ("visible to anyone who has played a game there at least
-- once") — it's actually "any signed-in user," matching the same
-- already-accepted simplification on the `venues` table's own read policy
-- in 0002_rls_policies.sql. No individual player buy-in/cash-out/net ever
-- appears in either view — only game-level pot/rake and attendance counts,
-- which is what the spec calls for surfacing at the venue level to begin
-- with. Tighten both to "actually played there" before this leaves
-- prototype status, same flag as the venues policy above it.

create view venue_game_rows as
select
  g.id as game_id,
  g.venue_id,
  g.host_id,
  hp.full_name as host_name,
  g.name as game_name,
  g.stake,
  g.chip_ratio,
  g.rake,
  g.closed_at,
  coalesce(sum(br.count) filter (where br.status = 'confirmed'), 0) as confirmed_buyin_units
from games g
join profiles hp on hp.id = g.host_id
left join game_players gp on gp.game_id = g.id
left join buyin_requests br on br.game_player_id = gp.id
where g.status = 'closed' and g.venue_id is not null
group by g.id, g.venue_id, g.host_id, hp.full_name, g.name, g.stake, g.chip_ratio, g.rake, g.closed_at;

grant select on venue_game_rows to authenticated;

create view venue_regulars as
select
  g.venue_id,
  gp.profile_id,
  p.full_name,
  count(distinct g.id) as games_played
from games g
join game_players gp on gp.game_id = g.id
join profiles p on p.id = gp.profile_id
where g.status = 'closed' and g.venue_id is not null
group by g.venue_id, gp.profile_id, p.full_name;

grant select on venue_regulars to authenticated;
