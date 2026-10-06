-- A host's "Add players" list is built from games THEY hosted, never from games
-- they merely played in or from other hosts' tables. The old my_regulars view
-- returned anyone who shared a closed game with the viewer, and relied on the
-- client to filter by viewer; venue_regulars let any signed-in user read the
-- names of everyone who played at a venue. Both leaked who plays where.

-- The filter lives inside the view (auth.uid()), so it cannot be skipped.
create view my_roster as
select
  g.host_id as viewer_id,
  gp.profile_id as other_id,
  p.full_name,
  count(distinct g.id) as games_played
from games g
join game_players gp on gp.game_id = g.id
join profiles p on p.id = gp.profile_id
where g.host_id = auth.uid()
  and gp.profile_id <> g.host_id
  and g.status in ('live', 'closed')
group by g.host_id, gp.profile_id, p.full_name;

grant select on my_roster to authenticated;

drop view if exists my_regulars;
revoke select on venue_regulars from authenticated;
