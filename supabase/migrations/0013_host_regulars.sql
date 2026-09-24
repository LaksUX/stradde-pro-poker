-- Host regulars — same aggregate-view shape as venue_regulars
-- (0006_venue_detail_views.sql), scoped to a host instead of a venue: every
-- profile who's completed at least one closed game under this host, with a
-- games-played count. Backs a new "Invite regulars" action so a host can
-- bulk-add people they already know into a new game instead of everyone
-- re-requesting to join from scratch every time.
--
-- [known simplification, same flag as venue_regulars] Readable by any
-- authenticated user, not gated to "only the host in question" — the
-- client always filters by host_id itself. Tighten alongside
-- venue_regulars before this leaves prototype status.

create view host_regulars as
select
  g.host_id,
  gp.profile_id,
  p.full_name,
  count(distinct g.id) as games_played
from games g
join game_players gp on gp.game_id = g.id
join profiles p on p.id = gp.profile_id
where g.status = 'closed' and gp.profile_id <> g.host_id
group by g.host_id, gp.profile_id, p.full_name;

grant select on host_regulars to authenticated;
